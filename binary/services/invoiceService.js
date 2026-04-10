const { connectBinaryDB } = require('../config/db');
const { getBinaryClientModel } = require('../models/BinaryClient');

/**
 * Generate invoice periods based on cycle length
 * MONTHLY: 12 invoices (01-12) for Jan-Dec, reused every year with paidYears tracking
 * YEARLY: 12 invoices for consecutive years
 * 
 * @param {string} cycleLength - MONTHLY or YEARLY
 * @param {Date} startDate - Service start date
 * @param {number} amount - Invoice amount
 * @returns {Array} Array of invoice objects
 */
function generateInvoices(cycleLength, startDate, amount) {
  const invoices = [];
  const currentYear = new Date().getFullYear();
  const dueDay = startDate.getDate();

  switch (cycleLength) {
    case 'YEARLY':
      // Generate 12 invoices for consecutive years (current + 11 more)
      for (let i = 0; i < 12; i++) {
        const year = currentYear + i;
        const dueDate = new Date(year, startDate.getMonth(), dueDay);
        invoices.push({
          period: year.toString(), // "2026", "2027", etc.
          dueDate,
          amount,
          paidYears: [],
          status: 'pending'
        });
      }
      break;

    case 'MONTHLY':
      // Generate only 12 invoices (Jan-Dec), reused every year via paidYears array
      for (let month = 1; month <= 12; month++) {
        // Use current year for dueDate calculation, but this repeats annually
        const dueDate = new Date(currentYear, month - 1, dueDay);
        invoices.push({
          period: String(month).padStart(2, '0'), // "01", "02", ... "12"
          dueDate,
          amount,
          paidYears: [], // e.g., [2024, 2025] means paid in these years
          status: 'pending'
        });
      }
      break;

    default:
      throw new Error(`Unsupported cycle length: ${cycleLength}. Must be MONTHLY or YEARLY`);
  }

  return invoices;
}

/**
 * Add invoices to a service when it's created
 * @param {string} clientId - Client ID
 * @param {string} serviceId - Service ID
 * @param {Object} serviceData - Service data
 */
async function addInvoicesToService(clientId, serviceId, serviceData) {
  try {
    if (serviceData.paymentType !== 'subscription') {
      return; // Only generate invoices for subscriptions
    }

    const connection = await connectBinaryDB();
    const BinaryClient = getBinaryClientModel(connection);

    const amount = serviceData.monthlyCost || 0;
    const startDate = new Date(serviceData.startDate);
    const invoices = generateInvoices(serviceData.cycleLength, startDate, amount);

    // Update the specific service with invoices
    await BinaryClient.updateOne(
      { _id: clientId, 'services._id': serviceId },
      { $set: { 'services.$.invoices': invoices } }
    );

    console.log(`Generated ${invoices.length} invoices for service ${serviceId}`);
  } catch (error) {
    console.error('Error adding invoices to service:', error);
    throw error;
  }
}

/**
 * Mark an invoice as paid for a specific year
 * For MONTHLY invoices: adds year to paidYears array (e.g., payment for Jan 2025)
 * For YEARLY invoices: adds year to paidYears array (e.g., payment for 2025)
 * 
 * @param {string} clientId - Client ID
 * @param {string} serviceId - Service ID
 * @param {string} period - Invoice period ("01" for January, or "2025" for yearly)
 * @param {number} year - Year of payment (e.g., 2025)
 */
async function markInvoiceAsPaid(clientId, serviceId, period, year) {
  try {
    const connection = await connectBinaryDB();
    const BinaryClient = getBinaryClientModel(connection);

    // Add year to paidYears array if not already present
    await BinaryClient.updateOne(
      {
        _id: clientId,
        'services._id': serviceId,
        'services.invoices.period': period
      },
      {
        $addToSet: {
          'services.$[svc].invoices.$[inv].paidYears': year
        }
      },
      {
        arrayFilters: [
          { 'svc._id': serviceId },
          { 'inv.period': period }
        ]
      }
    );

    console.log(`Added year ${year} to paidYears for invoice ${period} on service ${serviceId}`);
  } catch (error) {
    console.error('Error marking invoice as paid:', error);
    throw error;
  }
}

/**
 * Get due invoices for notification
 * Returns invoices where:
 * - Status is 'pending'
 * - For MONTHLY: current year NOT in paidYears
 * - For YEARLY: invoice year NOT in paidYears
 * - Due date has passed
 * 
 * @returns {Array} Array of due invoices with client and service info
 */
async function getDueInvoices() {
  try {
    const connection = await connectBinaryDB();
    const BinaryClient = getBinaryClientModel(connection);

    const now = new Date();
    const currentYear = now.getFullYear();

    // Find clients with services that have due invoices
    const clients = await BinaryClient.find({
      'services.invoices.status': 'pending'
    }).select('clientName contact services._id services.serviceName services.cycleLength services.invoices');

    const dueInvoices = [];

    clients.forEach(client => {
      client.services.forEach(service => {
        service.invoices.forEach(invoice => {
          if (invoice.status !== 'pending') return;

          let isUnpaidThisYear = false;

          if (service.cycleLength === 'MONTHLY') {
            // For monthly: check if current year is NOT in paidYears
            isUnpaidThisYear = !invoice.paidYears.includes(currentYear);
          } else if (service.cycleLength === 'YEARLY') {
            // For yearly: extract year from period ("2025", "2026", etc.)
            const invoiceYear = parseInt(invoice.period);
            isUnpaidThisYear = !invoice.paidYears.includes(invoiceYear);
          }

          // Check if due (due date has passed)
          const isDue = invoice.dueDate <= now;

          if (isUnpaidThisYear && isDue) {
            dueInvoices.push({
              clientId: client._id,
              clientName: client.clientName,
              contact: client.contact,
              serviceId: service._id,
              serviceName: service.serviceName,
              cycleLength: service.cycleLength,
              invoice
            });
          }
        });
      });
    });

    return dueInvoices;
  } catch (error) {
    console.error('Error getting due invoices:', error);
    throw error;
  }
}

/**
 * Mark notification as sent for an invoice
 * @param {string} clientId - Client ID
 * @param {string} serviceId - Service ID
 * @param {string} period - Invoice period
 * @param {string} type - 'email' or 'sms'
 */
async function markNotificationSent(clientId, serviceId, period, type) {
  try {
    const connection = await connectBinaryDB();
    const BinaryClient = getBinaryClientModel(connection);

    const field = type === 'email' ? 'emailSent' : 'smsSent';

    await BinaryClient.updateOne(
      {
        _id: clientId,
        'services._id': serviceId,
        'services.invoices.period': period
      },
      {
        $set: {
          [`services.$[svc].invoices.$[inv].${field}`]: true
        }
      },
      {
        arrayFilters: [
          { 'svc._id': serviceId },
          { 'inv.period': period }
        ]
      }
    );

    console.log(`Marked ${type} notification as sent for invoice ${period}`);
  } catch (error) {
    console.error(`Error marking ${type} notification as sent:`, error);
    throw error;
  }
}

module.exports = {
  generateInvoices,
  addInvoicesToService,
  markInvoiceAsPaid,
  getDueInvoices,
  markNotificationSent
};