/**
 * DEPRECATED — Stripe is not supported in Kenya.
 * All payment processing has been migrated to Pesapal (pesapalService.js).
 * This file is kept as a placeholder. Safe to delete.
 */
module.exports = {};

/**
 * Zero-decimal currencies in Stripe (pass amount as-is, no multiply by 100)
 * Full list: https://stripe.com/docs/currencies#zero-decimal
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW',
  'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'
]);

/**
 * Convert a human-readable amount to Stripe's smallest unit
 * @param {number} amount - e.g. 1500 (KES)
 * @param {string} currency - ISO 4217 currency code e.g. 'KES'
 * @returns {number} amount in smallest unit
 */
function toStripeAmount(amount, currency) {
  if (ZERO_DECIMAL_CURRENCIES.has((currency || 'KES').toUpperCase())) {
    return Math.round(amount);
  }
  return Math.round(amount * 100);
}

/**
 * Create or retrieve a Stripe customer for a Binary client
 * @param {string} clientName
 * @param {string} email
 * @param {string|null} existingCustomerId - pass if already exists
 * @returns {Promise<string>} Stripe customer ID
 */
async function ensureStripeCustomer(clientName, email, existingCustomerId = null) {
  const stripe = getStripe();

  if (existingCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(existingCustomerId);
      if (!customer.deleted) return customer.id;
    } catch {
      // Fall through to create new customer
    }
  }

  const customer = await stripe.customers.create({
    name: clientName,
    email: email || undefined,
    metadata: { source: 'binary-auto-payment' }
  });

  console.log(`[Stripe] Created customer ${customer.id} for ${clientName}`);
  return customer.id;
}

/**
 * Attach a payment method to a Stripe customer (idempotent)
 * @param {string} customerId
 * @param {string} paymentMethodId
 */
async function attachPaymentMethodToCustomer(customerId, paymentMethodId) {
  const stripe = getStripe();
  const pm = await stripe.paymentMethods.retrieve(paymentMethodId);

  // Already attached to this customer — no-op
  if (pm.customer === customerId) return;

  await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
  console.log(`[Stripe] Attached payment method ${paymentMethodId} to customer ${customerId}`);
}

/**
 * Charge a saved card for an off-session (automated) payment
 * @param {Object} params
 * @param {string} params.customerId         - Stripe customer ID
 * @param {string} params.paymentMethodId    - Stripe payment method ID
 * @param {number} params.amount             - Amount in human units (e.g. 1500 for KES 1500)
 * @param {string} params.currency           - ISO 4217 code (e.g. 'KES')
 * @param {string} params.description        - Short description shown on Stripe dashboard
 * @param {Object} params.metadata           - Key/value pairs for Stripe metadata
 * @returns {Promise<Object>} { success, paymentIntentId, status, error }
 */
async function chargeCard({ customerId, paymentMethodId, amount, currency, description, metadata }) {
  const stripe = getStripe();

  const stripeAmount = toStripeAmount(amount, currency);
  const stripeCurrency = (currency || 'KES').toLowerCase();

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: stripeAmount,
      currency: stripeCurrency,
      customer: customerId,
      payment_method: paymentMethodId,
      description,
      metadata: metadata || {},
      confirm: true,            // Confirm immediately
      off_session: true,        // No customer present — automated charge
      return_url: process.env.BINARY_FRONTEND_URL || 'https://binarybroske.com'
    });

    const succeeded = paymentIntent.status === 'succeeded';
    console.log(`[Stripe] PaymentIntent ${paymentIntent.id} status: ${paymentIntent.status}`);

    return {
      success: succeeded,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      error: succeeded ? null : `Payment status: ${paymentIntent.status}`
    };
  } catch (err) {
    // Stripe API errors (card declined, insufficient funds, etc.)
    const stripeCode = err.code || err.type || 'unknown';
    console.error(`[Stripe] Charge failed (${stripeCode}):`, err.message);
    return {
      success: false,
      paymentIntentId: null,
      status: 'failed',
      error: err.message || 'Stripe charge failed'
    };
  }
}

module.exports = {
  ensureStripeCustomer,
  attachPaymentMethodToCustomer,
  chargeCard,
  toStripeAmount
};
