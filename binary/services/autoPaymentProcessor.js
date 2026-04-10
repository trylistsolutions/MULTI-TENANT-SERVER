/**
 * Auto-Payment Processor
 * 
 * With Pesapal's customer-managed recurring billing, automatic card charges
 * are handled entirely by Pesapal. This module is no longer needed for
 * actively triggering payments.
 * 
 * Instead, Pesapal sends IPN notifications to /binary/pesapal/ipn
 * whenever a recurring charge succeeds or fails, and the IPN handler
 * in pesapalRoutes.js updates the client's paymentHistory automatically.
 * 
 * This file is kept for reference. Safe to delete.
 */
module.exports = {};

/**
 * Check if a service is due for payment today
 * A service is due when renewDate is today or is overdue (past due, up to 7 days late)
 * @param {Object} service
 * @returns {boolean}
 */
function isServiceDueToday(service) {
  if (!service.renewDate) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const renewDate = new Date(service.renewDate);
  renewDate.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((today - renewDate) / (1000 * 60 * 60 * 24));

  // Due today (0) or overdue up to 7 days
  return diffDays >= 0 && diffDays <= 7;
}

/**
 * Calculate the next renewal date based on cycleLength
 * @param {Date} fromDate - current renewal date
 * @param {string} cycleLength - 'monthly' | 'yearly'
 * @returns {Date}
 */
function computeNextRenewDate(fromDate, cycleLength) {
  const next = new Date(fromDate);
  const cycle = String(cycleLength).toLowerCase();

  if (cycle === 'yearly') {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    // Default: monthly
    next.setMonth(next.getMonth() + 1);
  }

  return next;
}

/**
 * Get the first active card with a Stripe payment method ID
 * @param {Array} cards
 * @returns {Object|null}
 */
function getActiveCard(cards) {
  if (!Array.isArray(cards)) return null;
  return cards.find((c) => c.active && c.stripePaymentMethodId) || null;
}

/**
 * Build the paymentHistory entry for a service
 * @param {Object} params
 * @returns {Object}
 */
function buildPaymentHistoryEntry({ amount, currency, stripePaymentIntentId, status, description }) {
  return {
    date: new Date(),
    amount,
    currency: (currency || 'KES').toUpperCase(),
    method: 'CARD',
    stripePaymentIntentId: stripePaymentIntentId || '',
    status,
    description: description || ''
  };
}

/**
 * Main automated payment processor
 * Runs daily — finds active clients with dues, attempts card charges via Stripe,
 * records results in each service's paymentHistory.
 */
async function processAutoPayments() {
  console.log('[Auto Payment] Job started at', new Date().toISOString());

  const connection = await connectBinaryDB();
  const BinaryClient = getBinaryClientModel(connection);

  // Fetch active clients that have at least one active card with a Stripe payment method
  const clients = await BinaryClient.find({
    accountStatus: 'active',
    'paymentProfiles.cards': {
      $elemMatch: {
        active: true,
        stripePaymentMethodId: { $exists: true, $ne: '' }
      }
    }
  });

  console.log(`[Auto Payment] Found ${clients.length} clients with active cards`);

  let totalProcessed = 0;
  let totalCharged = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const client of clients) {
    const activeCard = getActiveCard(client.paymentProfiles?.cards);

    if (!activeCard) {
      totalSkipped++;
      continue;
    }

    // Find subscription services that are due today
    const dueServices = (client.services || []).filter(
      (s) =>
        s.paymentType === 'subscription' &&
        s.status === 'active' &&
        ['monthly', 'yearly'].includes(String(s.cycleLength).toLowerCase()) &&
        isServiceDueToday(s)
    );

    if (dueServices.length === 0) {
      console.log(`[Auto Payment] ${client.clientName}: No services due today`);
      totalSkipped++;
      continue;
    }

    console.log(`[Auto Payment] ${client.clientName}: ${dueServices.length} service(s) due`);

    // Ensure the client has a Stripe customer (create one if missing)
    let stripeCustomerId = client.stripeCustomerId;
    try {
      const email = client.contact?.email || client.contact?.secondaryEmail;
      stripeCustomerId = await ensureStripeCustomer(client.clientName, email, stripeCustomerId);

      // Persist customer ID if it's new
      if (stripeCustomerId !== client.stripeCustomerId) {
        await BinaryClient.updateOne(
          { _id: client._id },
          { $set: { stripeCustomerId } }
        );
      }

      // Attach the payment method to the customer (idempotent)
      await attachPaymentMethodToCustomer(stripeCustomerId, activeCard.stripePaymentMethodId);
    } catch (setupErr) {
      console.error(`[Auto Payment] ${client.clientName}: Stripe setup failed —`, setupErr.message);
      totalFailed++;
      continue;
    }

    // Charge each due service individually
    for (const service of dueServices) {
      totalProcessed++;
      const amount = service.monthlyCost || 0;
      const currency = service.currency || 'KES';

      if (amount <= 0) {
        console.warn(`[Auto Payment] ${client.clientName} / ${service.serviceName}: Zero amount — skipping charge`);
        totalSkipped++;
        continue;
      }

      const description = `${service.serviceName} — ${String(service.cycleLength)} renewal (${client.clientName})`;

      let historyEntry;

      try {
        const result = await chargeCard({
          customerId: stripeCustomerId,
          paymentMethodId: activeCard.stripePaymentMethodId,
          amount,
          currency,
          description,
          metadata: {
            clientId: String(client._id),
            serviceId: String(service._id),
            serviceName: service.serviceName,
            clientName: client.clientName
          }
        });

        historyEntry = buildPaymentHistoryEntry({
          amount,
          currency,
          stripePaymentIntentId: result.paymentIntentId,
          status: result.success ? 'success' : 'failed',
          description: result.success ? description : result.error
        });

        if (result.success) {
          console.log(`[Auto Payment] ${client.clientName} / ${service.serviceName}: Charged ${currency} ${amount} ✓`);
          totalCharged++;
        } else {
          console.error(`[Auto Payment] ${client.clientName} / ${service.serviceName}: Charge failed — ${result.error}`);
          totalFailed++;
        }
      } catch (chargeErr) {
        console.error(`[Auto Payment] ${client.clientName} / ${service.serviceName}: Unexpected error —`, chargeErr.message);
        historyEntry = buildPaymentHistoryEntry({
          amount,
          currency,
          stripePaymentIntentId: null,
          status: 'failed',
          description: chargeErr.message
        });
        totalFailed++;
      }

      // Update service: push to paymentHistory; if charge succeeded, advance renewDate
      const updateFields = {
        $push: { 'services.$.paymentHistory': historyEntry }
      };

      if (historyEntry.status === 'success') {
        updateFields.$set = {
          'services.$.renewDate': computeNextRenewDate(service.renewDate, service.cycleLength)
        };
      }

      await BinaryClient.updateOne(
        { _id: client._id, 'services._id': service._id },
        updateFields
      );
    }
  }

  console.log('[Auto Payment] Job completed at', new Date().toISOString());
  console.log(
    `Summary — Processed: ${totalProcessed}, Charged: ${totalCharged}, Failed: ${totalFailed}, Skipped: ${totalSkipped}`
  );

  return { totalProcessed, totalCharged, totalFailed, totalSkipped };
}

module.exports = { processAutoPayments };
