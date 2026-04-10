const express = require('express');
const mongoose = require('mongoose');
const { connectBinaryDB } = require('../config/db');
const { getBinaryClientModel } = require('../models/BinaryClient');
const {
  registerIPN,
  getRegisteredIPNs,
  submitOrder,
  getTransactionStatus
} = require('../services/pesapalService');

const router = express.Router();
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

function buildRecurringAccountNumber(clientId, serviceId) {
  return `SUB-${String(clientId).slice(-6)}-${String(serviceId).slice(-6)}`;
}

function formatPesapalDate(date) {
  return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
}

function computeRecurringStartDate(service) {
  const cycle = String(service?.cycleLength || 'MONTHLY').toUpperCase();
  const now = new Date();

  if (cycle === 'YEARLY') {
    // Yearly: first execution is the service renew date in the following year.
    const baseRenewDate = service?.renewDate ? new Date(service.renewDate) : (service?.startDate ? new Date(service.startDate) : now);
    const yearlyStart = new Date(baseRenewDate);
    yearlyStart.setFullYear(yearlyStart.getFullYear() + 1);
    return formatPesapalDate(yearlyStart);
  }

  // Monthly: first execution is the 1st day of the following month.
  const monthlyStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return formatPesapalDate(monthlyStart);
}

// ─── One-time: Register IPN URL ────────────────────────────────
// GET /pesapal/register-ipn
router.get('/register-ipn', async (req, res) => {
  try {
    const result = await registerIPN();
    res.status(200).json({
      status: 'success',
      message: 'IPN registered. Save the ipn_id to PESAPAL_IPN_ID in your .env file.',
      data: result
    });
  } catch (error) {
    console.error('[Pesapal] Register IPN error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ─── Get registered IPN list ───────────────────────────────────
// GET /pesapal/ipn-list
router.get('/ipn-list', async (req, res) => {
  try {
    const list = await getRegisteredIPNs();
    res.status(200).json({ status: 'success', data: list });
  } catch (error) {
    console.error('[Pesapal] Get IPN list error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ─── Create Payment Order ──────────────────────────────────────
// POST /pesapal/create-order
// Body: { clientId, serviceId?, invoicePeriod?, amount, description, paymentType }
// paymentType: "subscription" or "one-time"
// invoicePeriod: specific invoice period (e.g., "01", "2025") for targeted payments
router.post('/create-order', async (req, res) => {
  try {
    const { clientId, serviceId, invoicePeriod, amount, description, paymentType, callbackUrl } = req.body;

    if (!clientId || !isValidObjectId(clientId)) {
      return res.status(400).json({ status: 'error', message: 'Valid clientId is required.' });
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ status: 'error', message: 'Amount must be greater than 0.' });
    }

    const connection = await connectBinaryDB();
    const BinaryClient = getBinaryClientModel(connection);
    const client = await BinaryClient.findById(clientId);

    if (!client) {
      return res.status(404).json({ status: 'error', message: 'Client not found.' });
    }

    // Build unique merchant reference with invoice tracking
    const timestamp = Date.now();
    let merchantReference;

    if (serviceId && invoicePeriod) {
      // Specific invoice payment: INV-{clientId}-{serviceId}-{invoicePeriod}-{timestamp}
      merchantReference = `INV-${clientId}-${serviceId}-${invoicePeriod}-${timestamp}`;
      console.log(`[Pesapal Order] Creating payment for specific invoice: Service ${serviceId}, Period ${invoicePeriod}`);
    } else if (serviceId) {
      // General service payment: SVC-{clientId}-{serviceId}-{timestamp}
      merchantReference = `SVC-${clientId}-${serviceId}-${timestamp}`;
      console.log(`[Pesapal Order] Creating general service payment: Service ${serviceId}`);
    } else {
      // General payment: PAY-{clientId}-{timestamp}
      merchantReference = `PAY-${clientId}-${timestamp}`;
      console.log(`[Pesapal Order] Creating general client payment`);
    }

    // For subscriptions, set account_number so Pesapal enables recurring
    let accountNumber = null;
    if (paymentType === 'subscription') {
      const service = serviceId ? client.services.id(serviceId) : null;
      accountNumber = service?.pesapalAccountNumber || buildRecurringAccountNumber(clientId, serviceId || 'general');

      if (serviceId && service && service.pesapalAccountNumber !== accountNumber) {
        await BinaryClient.updateOne(
          { _id: client._id, 'services._id': serviceId },
          { $set: { 'services.$.pesapalAccountNumber': accountNumber } }
        );
      }
    }

    const email = client.contact?.email || client.contact?.secondaryEmail || '';
    const phone = client.contact?.phone || client.contact?.secondaryPhone || '';
    const nameParts = client.clientName.split(' ');

    // Build subscription details for recurring payments
    let subscriptionDetails = null;
    if (paymentType === 'subscription' && serviceId) {
      const service = client.services.id(serviceId);
      if (service) {
        const frequency = String(service.cycleLength || 'MONTHLY').toUpperCase();
        const startStr = computeRecurringStartDate(service);

        // Prefill recurring setup in Pesapal iframe.
        // Intentionally omit end_date so billing remains open-ended.
        subscriptionDetails = {
          start_date: startStr,
          frequency
        };

        console.log(`[Pesapal Order] Subscription prefill for ${service.serviceName}:`, subscriptionDetails);
      }
    }

    const order = await submitOrder({
      merchantReference,
      amount: parseFloat(amount),
      currency: 'KES',
      description: description || `Payment for ${client.clientName}`,
      callbackUrl,
      accountNumber,
      subscriptionDetails,
      billingAddress: {
        email_address: email,
        phone_number: phone,
        country_code: 'KE',
        first_name: nameParts[0] || '',
        last_name: nameParts.slice(1).join(' ') || ''
      }
    });

    // If a specific service was targeted, add a pending paymentHistory entry
    if (serviceId && isValidObjectId(serviceId)) {
      await BinaryClient.updateOne(
        { _id: client._id, 'services._id': serviceId },
        {
          $push: {
            'services.$.paymentHistory': {
              date: new Date(),
              amount: parseFloat(amount),
              currency: 'KES',
              method: 'PESAPAL',
              pesapalOrderTrackingId: order.order_tracking_id,
              pesapalMerchantReference: order.merchant_reference,
              status: 'pending',
              description: description || 'Pesapal payment initiated'
            }
          }
        }
      );
    }

    res.status(200).json({
      status: 'success',
      data: {
        redirect_url: order.redirect_url,
        order_tracking_id: order.order_tracking_id,
        merchant_reference: order.merchant_reference
      }
    });
  } catch (error) {
    console.error('[Pesapal] Create order error:', error.message);
    res.status(500).json({ status: 'error', message: 'Failed to create payment order.' });
  }
});

// ─── IPN Listener ──────────────────────────────────────────────
// GET/POST /pesapal/ipn
// Pesapal calls this whenever a payment status changes.
router.all('/ipn', async (req, res) => {
  console.log(`[Pesapal IPN] Received ${req.method} request at /pesapal/ipn`);
  const payload = Object.keys(req.query).length ? req.query : req.body;
  const OrderTrackingId = payload.OrderTrackingId || payload.orderTrackingId || payload.ordertrackingid;
  const OrderMerchantReference = payload.OrderMerchantReference || payload.orderMerchantReference || payload.ordermerchantreference;
  const OrderNotificationType = payload.OrderNotificationType || payload.orderNotificationType || payload.ordernotificationtype;

  console.log(`[Pesapal IPN] Received payload type: ${req.method}`);
  console.log(`[Pesapal IPN] Received payload source: ${Object.keys(req.query).length ? 'query' : 'body'}`);
  console.log(`[Pesapal IPN] Full payload:`, JSON.stringify(payload, null, 2));

  console.log(`[Pesapal IPN] ===== RECEIVED IPN NOTIFICATION =====`);
  console.log(`[Pesapal IPN] Timestamp: ${new Date().toISOString()}`);
  console.log(`[Pesapal IPN] Type: ${OrderNotificationType}`);
  console.log(`[Pesapal IPN] OrderTrackingId: ${OrderTrackingId}`);
  console.log(`[Pesapal IPN] OrderMerchantReference: ${OrderMerchantReference}`);
  console.log(`[Pesapal IPN] Full Query Params:`, JSON.stringify(req.query, null, 2));

  try {
    const connection = await connectBinaryDB();
    const BinaryClient = getBinaryClientModel(connection);

    if (!OrderTrackingId) {
      console.error(`[Pesapal IPN] ❌ ERROR: Missing OrderTrackingId`);
      return res.json({
        orderNotificationType: 'IPNCHANGE',
        orderTrackingId: OrderTrackingId,
        orderMerchantReference: OrderMerchantReference,
        status: 500
      });
    }

    console.log(`[Pesapal IPN] 🔍 Fetching transaction status from Pesapal API...`);

    // Fetch actual payment status from Pesapal (IPN itself does NOT contain status for security)
    const txnStatus = await getTransactionStatus(OrderTrackingId);

    console.log(`[Pesapal IPN] 📊 Transaction Status Retrieved:`);
    console.log(`[Pesapal IPN] Status Code: ${txnStatus.status_code}`);
    console.log(`[Pesapal IPN] Status Description: ${txnStatus.payment_status_description}`);
    console.log(`[Pesapal IPN] Payment Method: ${txnStatus.payment_method || 'UNKNOWN'}`);
    console.log(`[Pesapal IPN] Amount: ${txnStatus.amount} ${txnStatus.currency}`);
    console.log(`[Pesapal IPN] Confirmation Code: ${txnStatus.confirmation_code || 'N/A'}`);
    console.log(`[Pesapal IPN] Created Date: ${txnStatus.created_date}`);
    console.log(`[Pesapal IPN] Full Response:`, JSON.stringify(txnStatus, null, 2));

    const statusMap = { 0: 'failed', 1: 'success', 2: 'failed', 3: 'reversed' };
    const paymentStatus = statusMap[txnStatus.status_code] || 'failed';
    const paymentMethod = txnStatus.payment_method || '';

    console.log(`[Pesapal IPN] 🎯 Mapped Status: ${paymentStatus} (${txnStatus.status_code})`);
    console.log(`[Pesapal IPN] 💳 Payment Method: ${paymentMethod || 'Not specified'}`);

    // Log payment method details for better tracking
    if (paymentMethod) {
      console.log(`[Pesapal IPN] 📱 Payment Method Analysis:`);
      if (paymentMethod.toLowerCase().includes('mpesa')) {
        console.log(`[Pesapal IPN] - M-Pesa payment detected`);
      } else if (paymentMethod.toLowerCase().includes('card') || paymentMethod.toLowerCase().includes('visa') || paymentMethod.toLowerCase().includes('mastercard')) {
        console.log(`[Pesapal IPN] - Card payment detected (${paymentMethod})`);
      } else if (paymentMethod.toLowerCase().includes('airtel') || paymentMethod.toLowerCase().includes('equity') || paymentMethod.toLowerCase().includes('bank')) {
        console.log(`[Pesapal IPN] - Bank/Mobile money payment detected (${paymentMethod})`);
      } else {
        console.log(`[Pesapal IPN] - Other payment method: ${paymentMethod}`);
      }
    }

    // Check for recurring payment information
    const subscriptionInfo = txnStatus.subscription_transaction_info || {};
    const hasRecurringInfo = Boolean(
      subscriptionInfo.correlation_id ||
      subscriptionInfo.status ||
      OrderNotificationType === 'RECURRING'
    );

    if (hasRecurringInfo) {
      console.log(`[Pesapal IPN] 🔄 Recurring Payment Detected:`);
      console.log(`[Pesapal IPN] Correlation ID: ${subscriptionInfo.correlation_id || 'N/A'}`);
      console.log(`[Pesapal IPN] Recurring Status: ${subscriptionInfo.status || 'N/A'}`);
      console.log(`[Pesapal IPN] Notification Type: ${OrderNotificationType}`);
    } else {
      console.log(`[Pesapal IPN] 💰 One-time Payment (no recurring info)`);
    }

    // Parse merchant reference to find client + service + invoice
    // Formats:
    // INV-{clientId}-{serviceId}-{invoicePeriod}-{ts} - Specific invoice payment
    // SVC-{clientId}-{serviceId}-{ts} - General service payment
    // PAY-{clientId}-{ts} - General payment
    // SUB-{accountNumber} - Recurring subscription payment
    const refParts = String(OrderMerchantReference).split('-');
    const refType = refParts[0]; // INV, SVC, PAY, or SUB

    console.log(`[Pesapal IPN] 🔍 Parsing Merchant Reference: ${OrderMerchantReference}`);
    console.log(`[Pesapal IPN] Reference Type: ${refType}`);

    if (refType === 'INV' && refParts.length >= 4) {
      // Specific invoice payment: INV-{clientId}-{serviceId}-{invoicePeriod}-{ts}
      const clientId = refParts[1];
      const serviceId = refParts[2];
      const invoicePeriod = refParts[3];

      console.log(`[Pesapal IPN] 🎯 Specific Invoice Payment:`);
      console.log(`[Pesapal IPN] Client ID: ${clientId}`);
      console.log(`[Pesapal IPN] Service ID: ${serviceId}`);
      console.log(`[Pesapal IPN] Invoice Period: ${invoicePeriod}`);

      // Update the specific invoice status
      const updateResult = await BinaryClient.updateOne(
        {
          _id: clientId,
          'services._id': serviceId,
          'services.invoices.period': invoicePeriod
        },
        {
          $set: {
            'services.$[svc].invoices.$[inv].status': paymentStatus === 'success' ? 'paid' : 'pending',
            'services.$[svc].invoices.$[inv].emailSent': false // Reset email flag for failed payments
          }
        },
        {
          arrayFilters: [
            { 'svc._id': new mongoose.Types.ObjectId(serviceId) },
            { 'inv.period': invoicePeriod }
          ]
        }
      );

      console.log(`[Pesapal IPN] Updated invoice ${invoicePeriod} status to ${paymentStatus}:`, updateResult.modifiedCount, 'docs modified');

// Update the matching paymentHistory entry (update existing "pending" entry instead of creating new)
        const paymentHistoryUpdate = await BinaryClient.updateOne(
          {
            _id: clientId,
            'services._id': serviceId,
            'services.paymentHistory.pesapalOrderTrackingId': OrderTrackingId
          },
          {
            $set: {
              'services.$[svc].paymentHistory.$[ph].status': paymentStatus,
              'services.$[svc].paymentHistory.$[ph].method': paymentMethod || 'PESAPAL',
              'services.$[svc].paymentHistory.$[ph].confirmationCode': txnStatus.confirmation_code || '',
              'services.$[svc].paymentHistory.$[ph].description': `Invoice ${invoicePeriod} payment - ${txnStatus.payment_status_description || ''}`
            }
          },
          {
            arrayFilters: [
              { 'svc._id': new mongoose.Types.ObjectId(serviceId) },
              { 'ph.pesapalOrderTrackingId': OrderTrackingId }
            ]
          }
        );
        
        console.log(`[IPN INV] Updated payment history for order ${OrderTrackingId}:`, paymentHistoryUpdate.modifiedCount > 0 ? 'SUCCESS' : 'NO MATCH FOUND');
      // If payment succeeded, mark the year as paid
      if (paymentStatus === 'success') {
        const year = invoicePeriod.length === 4 ? parseInt(invoicePeriod) : new Date().getFullYear();

        // For per-invoice tracking, update paidYears on the invoice object
        await BinaryClient.updateOne(
          { _id: clientId, 'services._id': serviceId },
          {
            $addToSet: {
              'services.$[svc].invoices.$[inv].paidYears': year
            }
          },
          {
            arrayFilters: [
              { 'svc._id': new mongoose.Types.ObjectId(serviceId) },
              { 'inv.period': invoicePeriod }
            ]
          }
        );

        console.log(`[Pesapal IPN] Marked year ${year} as paid for invoice ${invoicePeriod} on service ${serviceId}`);

        // Update total lifetime value
        await BinaryClient.updateOne(
          { _id: clientId },
          { $inc: { totalLifetimeValue: txnStatus.amount || 0 } }
        );
      }

      // Handle auto-renewal setup if this was a subscription payment
      if (hasRecurringInfo && paymentStatus === 'success') {
        await BinaryClient.updateOne(
          { _id: clientId, 'services._id': serviceId },
          {
            $set: {
              'services.$.autoBillingEnabled': true,
              'services.$.autoBillingActivatedAt': new Date(),
              'services.$.pesapalRecurringId': subscriptionInfo.correlation_id || '',
              'services.$.pesapalRecurringStatus': subscriptionInfo.status || 'active'
            }
          }
        );
        console.log(`[Pesapal IPN] ✅ Auto-renewal enabled for service ${serviceId}`);
      }

    } else if (refType === 'SVC' && refParts.length >= 3) {
      // General service payment: SVC-{clientId}-{serviceId}-{ts}
      const clientId = refParts[1];
      const serviceId = refParts[2];

      console.log(`[Pesapal IPN] 🎯 General Service Payment:`);
      console.log(`[Pesapal IPN] Client ID: ${clientId}`);
      console.log(`[Pesapal IPN] Service ID: ${serviceId}`);

      // Update the matching paymentHistory entry
      const updateResult = await BinaryClient.updateOne(
        {
          _id: clientId,
          'services._id': serviceId,
          'services.paymentHistory.pesapalOrderTrackingId': OrderTrackingId
        },
        {
          $set: {
            'services.$[svc].paymentHistory.$[ph].status': paymentStatus,
            'services.$[svc].paymentHistory.$[ph].method': paymentMethod,
            'services.$[svc].paymentHistory.$[ph].confirmationCode': txnStatus.confirmation_code || '',
            'services.$[svc].paymentHistory.$[ph].description': txnStatus.payment_status_description || ''
          }
        },
        {
          arrayFilters: [
            { 'svc._id': new mongoose.Types.ObjectId(serviceId) },
            { 'ph.pesapalOrderTrackingId': OrderTrackingId }
          ]
        }
      );

      console.log(`[Pesapal IPN] Updated service ${serviceId} payment history:`, updateResult.modifiedCount, 'docs modified');

      // If payment succeeded, advance the renewDate for subscription services
      if (paymentStatus === 'success') {
        const client = await BinaryClient.findById(clientId);
        if (client) {
          const service = client.services.id(serviceId);
          if (service && service.paymentType === 'subscription' && service.renewDate) {
            const cycle = String(service.cycleLength).toLowerCase();
            const nextRenew = new Date(service.renewDate);
            if (cycle === 'yearly') {
              nextRenew.setFullYear(nextRenew.getFullYear() + 1);
            } else {
              nextRenew.setMonth(nextRenew.getMonth() + 1);
            }

            await BinaryClient.updateOne(
              { _id: clientId, 'services._id': serviceId },
              { $set: { 'services.$.renewDate': nextRenew } }
            );
            console.log(`[Pesapal IPN] Advanced renewDate for ${service.serviceName} to ${nextRenew.toISOString()}`);
          }

          // Handle auto-renewal setup for subscription services.
          // The FIRST successful card payment (which enrolls the customer) comes back as a normal
          // IPNCHANGE with status_code=1 but without subscription_transaction_info. We must still
          // flip autoBillingEnabled on so the dashboard reflects the active subscription.
          if (service.paymentType === 'subscription') {
            await BinaryClient.updateOne(
              { _id: clientId, 'services._id': serviceId },
              {
                $set: {
                  'services.$.autoBillingEnabled': true,
                  'services.$.autoBillingActivatedAt': service.autoBillingActivatedAt || new Date(),
                  'services.$.pesapalRecurringId': subscriptionInfo.correlation_id || service.pesapalRecurringId || '',
                  'services.$.pesapalRecurringStatus': subscriptionInfo.correlation_id ? 'active' : (service.pesapalRecurringStatus || 'active')
                }
              }
            );
            console.log(`[Pesapal IPN] ✅ Auto-billing activated for subscription service ${serviceId}`);
          }

          // Update totalLifetimeValue
          await BinaryClient.updateOne(
            { _id: clientId },
            { $inc: { totalLifetimeValue: txnStatus.amount || 0 } }
          );
        }
      }
    } else if (refType === 'PAY' && refParts.length >= 2) {
      // General payment: PAY-{clientId}-{ts}
      const clientId = refParts[1];
      console.log(`[Pesapal IPN] 🎯 General Client Payment: Client ID ${clientId}`);

      // For general payments, just update lifetime value
      if (paymentStatus === 'success') {
        await BinaryClient.updateOne(
          { _id: clientId },
          { $inc: { totalLifetimeValue: txnStatus.amount || 0 } }
        );
        console.log(`[Pesapal IPN] Updated lifetime value for client ${clientId}`);
      }
    } else if (refType === 'SUB') {
      // Recurring subscription payment: SUB-{accountNumber}
      // Pesapal fires this IPN with OrderMerchantReference = the account_number we set.
      // There is NO pre-existing paymentHistory entry — we must push a new one.
      console.log(`[Pesapal IPN] 🔄 Recurring Subscription Payment: ${OrderMerchantReference}`);

      const subInfo = txnStatus.subscription_transaction_info || {};
      // For RECURRING IPNs the account_reference IS the account_number / merchant reference
      const accountNumber = subInfo.account_reference || OrderMerchantReference;
      const client = await BinaryClient.findOne({ 'services.pesapalAccountNumber': accountNumber });
      const service = client?.services?.find((entry) => entry.pesapalAccountNumber === accountNumber);

      if (client && service) {
        console.log(`[Pesapal IPN] Found service ${service._id} (${service.serviceName}) for recurring payment`);

        // Calculate next renewal date based on current renewDate
        let nextRenewDate = service.renewDate || new Date();
        const cycle = String(service.cycleLength || 'MONTHLY').toLowerCase();
        const nextRenew = new Date(nextRenewDate);
        if (cycle === 'yearly') {
          nextRenew.setFullYear(nextRenew.getFullYear() + 1);
        } else {
          nextRenew.setMonth(nextRenew.getMonth() + 1);
        }
        nextRenewDate = nextRenew;
        console.log(`[Pesapal IPN] Next renew date: ${nextRenewDate.toISOString()}`);

        // Push a new payment history entry (there is no pending entry to update)
        await BinaryClient.updateOne(
          { _id: client._id, 'services._id': service._id },
          {
            $push: {
              'services.$.paymentHistory': {
                date: new Date(),
                amount: txnStatus.amount || service.monthlyCost || 0,
                currency: txnStatus.currency || service.currency || 'KES',
                method: paymentMethod || 'PESAPAL',
                pesapalOrderTrackingId: OrderTrackingId,
                pesapalMerchantReference: OrderMerchantReference,
                confirmationCode: txnStatus.confirmation_code || '',
                status: paymentStatus,
                description: `Recurring auto-charge - ${txnStatus.payment_status_description || 'Auto payment'}`
              }
            },
            $set: {
              'services.$.autoBillingEnabled': true,
              'services.$.autoBillingActivatedAt': service.autoBillingActivatedAt || new Date(),
              'services.$.pesapalRecurringId': subInfo.correlation_id || service.pesapalRecurringId || '',
              'services.$.pesapalRecurringStatus': 'active',
              'services.$.renewDate': nextRenewDate
            }
          }
        );

        // Mark the current-cycle invoice as paid
        if (paymentStatus === 'success') {
          const now = new Date();
          const currentYear = now.getFullYear();

          // Determine the invoice period key:
          // MONTHLY: "01"–"12"  YEARLY: "2025", "2026" …
          let invoicePeriod;
          if (cycle === 'yearly') {
            invoicePeriod = String(currentYear);
          } else {
            invoicePeriod = String(now.getMonth() + 1).padStart(2, '0');
          }

          const invoicePaidUpdate = await BinaryClient.updateOne(
            {
              _id: client._id,
              'services._id': service._id,
              'services.invoices.period': invoicePeriod
            },
            {
              $set: { 'services.$[svc].invoices.$[inv].status': 'paid' },
              $addToSet: { 'services.$[svc].invoices.$[inv].paidYears': currentYear }
            },
            {
              arrayFilters: [
                { 'svc._id': new mongoose.Types.ObjectId(service._id) },
                { 'inv.period': invoicePeriod }
              ]
            }
          );
          console.log(`[Pesapal IPN] Marked invoice period ${invoicePeriod} as paid:`, invoicePaidUpdate.modifiedCount, 'docs modified');

          // Update client lifetime value
          await BinaryClient.updateOne(
            { _id: client._id },
            { $inc: { totalLifetimeValue: txnStatus.amount || 0 } }
          );
        }

        console.log(`[Pesapal IPN] ✅ Processed recurring payment for service ${service._id}`);
      } else {
        console.error(`[Pesapal IPN] ❌ Could not find service for recurring account_number: ${accountNumber}`);
      }
    } else {
      console.error(`[Pesapal IPN] ❌ Unknown merchant reference format: ${OrderMerchantReference}`);
    }

    // Acknowledge to Pesapal (required).
    // For RECURRING IPNs, the orderNotificationType must be "RECURRING" — not "IPNCHANGE".
    const acknowledgment = {
      orderNotificationType: OrderNotificationType || 'IPNCHANGE',
      orderTrackingId: OrderTrackingId,
      orderMerchantReference: OrderMerchantReference,
      status: 200
    };

    console.log(`[Pesapal IPN] ✅ Acknowledgment sent to Pesapal:`);
    console.log(`[Pesapal IPN] Response:`, JSON.stringify(acknowledgment, null, 2));
    console.log(`[Pesapal IPN] ===== IPN PROCESSING COMPLETE =====`);

    res.json(acknowledgment);
  } catch (error) {
    console.error(`[Pesapal IPN] ❌ CRITICAL ERROR during IPN processing:`, error.message);
    console.error(`[Pesapal IPN] Stack trace:`, error.stack);
    console.error(`[Pesapal IPN] ===== IPN PROCESSING FAILED =====`);

    // Still acknowledge to Pesapal even on error to prevent retries
    res.json({
      orderNotificationType: OrderNotificationType || 'IPNCHANGE',
      orderTrackingId: OrderTrackingId,
      orderMerchantReference: OrderMerchantReference,
      status: 500
    });
  }
});

// ─── Callback (customer redirect after payment) ────────────────
// GET /pesapal/callback?OrderTrackingId=xxx&OrderMerchantReference=xxx&OrderNotificationType=CALLBACKURL
router.get('/callback', async (req, res) => {
  const { OrderTrackingId, OrderMerchantReference } = req.query;

  try {
    // Fetch payment status
    const txnStatus = await getTransactionStatus(OrderTrackingId);

    const statusMap = { 0: 'INVALID', 1: 'COMPLETED', 2: 'FAILED', 3: 'REVERSED' };
    const statusText = statusMap[txnStatus.status_code] || 'UNKNOWN';

    // === FALLBACK: update payment state in DB on callback when IPN may not fire ===
    try {
      const connection = await connectBinaryDB();
      const BinaryClient = getBinaryClientModel(connection);

      const success = txnStatus.status_code === 1;
      const paymentStatus = success ? 'success' : 'failed';
      const paymentMethod = txnStatus.payment_method || 'PESAPAL';

      const refParts = String(OrderMerchantReference).split('-');
      const refType = refParts[0];

      if (refType === 'INV' && refParts.length >= 4) {
        const clientId = refParts[1];
        const serviceId = refParts[2];
        const invoicePeriod = refParts[3];

        await BinaryClient.updateOne(
          {
            _id: clientId,
            'services._id': serviceId,
            'services.invoices.period': invoicePeriod
          },
          {
            $set: {
              'services.$[svc].invoices.$[inv].status': success ? 'paid' : 'pending',
              'services.$[svc].invoices.$[inv].emailSent': false
            }
            // Note: Payment history is handled by IPN endpoint, not callback (to avoid duplicates)
          },
          {
            arrayFilters: [
              { 'svc._id': new mongoose.Types.ObjectId(serviceId) },
              { 'inv.period': invoicePeriod }
            ]
          }
        );

        if (success) {
          const year = invoicePeriod.length === 4 ? parseInt(invoicePeriod) : new Date().getFullYear();
          await BinaryClient.updateOne(
            { _id: clientId, 'services._id': serviceId },
            {
              $addToSet: {
                'services.$[svc].invoices.$[inv].paidYears': year
              }
            },
            {
              arrayFilters: [
                { 'svc._id': new mongoose.Types.ObjectId(serviceId) },
                { 'inv.period': invoicePeriod }
              ]
            }
          );
        }

        console.log('[Pesapal Callback] Updated invoice record via callback for', OrderMerchantReference);
      }

      if (refType === 'SVC' || refType === 'PAY') {
        const clientId = refParts[1];
        await BinaryClient.updateOne(
          { _id: clientId },
          { $inc: { totalLifetimeValue: txnStatus.amount || 0 } }
        );
        console.log('[Pesapal Callback] Updated totalLifetimeValue for', refType, clientId);
      }
    } catch (innerErr) {
      console.error('[Pesapal Callback] Fallback DB update failed:', innerErr.message);
    }

    // Redirect back to the client's dashboard with status info
    const frontendUrl = process.env.BINARY_FRONTEND_URL || 'https://binarybroske.com';
    const redirectUrl = `${frontendUrl}/payment/result?status=${statusText}&ref=${encodeURIComponent(OrderMerchantReference)}&trackingId=${encodeURIComponent(OrderTrackingId)}`;

    res.redirect(redirectUrl);
  } catch (error) {
    console.error('[Pesapal] Callback error:', error.message);
    const frontendUrl = process.env.BINARY_FRONTEND_URL || 'https://binarybroske.com';
    res.redirect(`${frontendUrl}/payment/result?status=ERROR`);
  }
});

// ─── Check Transaction Status ──────────────────────────────────
// GET /pesapal/status/:orderTrackingId
router.get('/status/:orderTrackingId', async (req, res) => {
  try {
    const { orderTrackingId } = req.params;
    const txnStatus = await getTransactionStatus(orderTrackingId);

    res.status(200).json({
      status: 'success',
      data: {
        payment_method: txnStatus.payment_method,
        amount: txnStatus.amount,
        currency: txnStatus.currency,
        payment_status: txnStatus.payment_status_description,
        status_code: txnStatus.status_code,
        confirmation_code: txnStatus.confirmation_code,
        created_date: txnStatus.created_date,
        merchant_reference: txnStatus.merchant_reference
      }
    });
  } catch (error) {
    console.error('[Pesapal] Status check error:', error.message);
    res.status(500).json({ status: 'error', message: 'Failed to check transaction status.' });
  }
});

module.exports = router;
