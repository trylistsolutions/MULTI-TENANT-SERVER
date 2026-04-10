const { connectBinaryDB } = require('../config/db');
const { getBinaryClientModel } = require('../models/BinaryClient');
const { sendNotification } = require('./smsService');
const { sendCyclePaymentReminder } = require('./emailService');

/**
 * Check if today is within 3 days before month end
 * @returns {boolean}
 */
function isCyclePaymentReminderDay() {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  // Get last day of current month
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Get today's day
  const todayDay = today.getDate();

  // Check if today is within 3 days before month end (days 28-30/31 for most months)
  const daysUntilMonthEnd = lastDayOfMonth - todayDay;
  return daysUntilMonthEnd >= 0 && daysUntilMonthEnd <= 2; // 0, 1, or 2 days until month ends
}

/**
 * Filter services that are "cycle" payments (subscription with monthly/yearly frequency)
 * @param {Array} services - All services for client
 * @returns {Array} Filtered cycle services
 */
function getCycleServices(services) {
  if (!Array.isArray(services)) return [];

  return services.filter(
    (service) =>
      service.paymentType === 'subscription' &&
      service.status === 'active' &&
      ['monthly', 'yearly'].includes(String(service.cycleLength).toLowerCase())
  );
}

/**
 * Get contact info with fallback to secondary
 * @param {Object} contact - Contact object
 * @returns {Object} { phone, email } with primary or secondary
 */
function getContactInfo(contact) {
  if (!contact) {
    return { phone: null, email: null };
  }

  return {
    phone: contact.phone || contact.secondaryPhone || null,
    email: contact.email || contact.secondaryEmail || null
  };
}

/**
 * Format SMS message for cycle payment reminder
 * @param {string} clientName - Client name
 * @param {Array} services - Services due
 * @param {Date} renewalDate - Renewal date
 * @returns {string} SMS message
 */
function formatSMSMessage(clientName, services, renewalDate) {
  const formattedDate = renewalDate.toLocaleDateString('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  const serviceCount = services.length;
  const totalCost = services.reduce((sum, s) => sum + (s.monthlyCost || 0), 0);

  return `Hello ${clientName},\n\nReminder: You have ${serviceCount} active service(s) scheduled for renewal on ${formattedDate}.\n\nTotal due: KES ${totalCost}\n\nPlease ensure payment is made on time.\n\nNairobi Zoezi Institute`;
}

/**
 * Main function: Check all clients and send cycle payment reminders
 */
async function processCyclePaymentReminders() {
  try {
    console.log('[Cycle Payment Reminder] Job started at', new Date().toISOString());

    // Check if today is a reminder day
    if (!isCyclePaymentReminderDay()) {
      console.log('[Cycle Payment Reminder] Not a reminder day. Next reminder in', getDaysUntilReminder(), 'days.');
      return;
    }

    const connection = await connectBinaryDB();
    const BinaryClient = getBinaryClientModel(connection);

    // Fetch all active clients
    const clients = await BinaryClient.find({ accountStatus: 'active' });
    console.log(`[Cycle Payment Reminder] Found ${clients.length} active clients`);

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    // Process each client
    for (const client of clients) {
      processed++;

      try {
        // Get cycle services for this client
        const cycleServices = getCycleServices(client.services);

        if (cycleServices.length === 0) {
          console.log(`[${processed}/${clients.length}] ${client.clientName}: No cycle services found`);
          continue;
        }

        // Get contact info with fallback
        const { phone, email } = getContactInfo(client.contact);

        if (!phone && !email) {
          console.warn(`[${processed}/${clients.length}] ${client.clientName}: No contact info available. Skipping.`);
          failed++;
          continue;
        }

        // Calculate renewal date (first day of next month)
        const today = new Date();
        const renewalDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);

        // Send SMS if phone exists
        if (phone) {
          try {
            const smsMessage = formatSMSMessage(client.clientName, cycleServices, renewalDate);
            await sendNotification(phone, smsMessage);
            console.log(`[${processed}/${clients.length}] ${client.clientName}: SMS sent to ${phone}`);
          } catch (smsError) {
            console.error(`[${processed}/${clients.length}] ${client.clientName}: SMS failed -`, smsError.message);
          }
        }

        // Send Email if email exists
        if (email) {
          try {
            await sendCyclePaymentReminder(email, client.clientName, cycleServices, renewalDate);
            console.log(`[${processed}/${clients.length}] ${client.clientName}: Email sent to ${email}`);
          } catch (emailError) {
            console.error(`[${processed}/${clients.length}] ${client.clientName}: Email failed -`, emailError.message);
          }
        }

        succeeded++;
      } catch (clientError) {
        console.error(`[${processed}/${clients.length}] ${client.clientName}: Error processing client -`, clientError.message);
        failed++;
      }
    }

    console.log('[Cycle Payment Reminder] Job completed at', new Date().toISOString());
    console.log(`Summary: Processed=${processed}, Succeeded=${succeeded}, Failed=${failed}`);
  } catch (error) {
    console.error('[Cycle Payment Reminder] Job failed:', error.message);
  }
}

/**
 * Calculate days until next reminder (3 days before month end)
 * @returns {number}
 */
function getDaysUntilReminder() {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  // Last day of current month
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  // First reminder day is 2 days before month end
  const firstReminderDay = lastDayOfMonth - 2;

  const todayDay = today.getDate();

  if (todayDay <= firstReminderDay) {
    // Reminder is still this month
    return firstReminderDay - todayDay;
  } else {
    // Reminder is next month
    const daysLeftInMonth = lastDayOfMonth - todayDay;
    const nextMonthFirstReminderDay = new Date(currentYear, currentMonth + 2, 0).getDate() - 2;
    return daysLeftInMonth + nextMonthFirstReminderDay;
  }
}

module.exports = { processCyclePaymentReminders, isCyclePaymentReminderDay, getCycleServices };
