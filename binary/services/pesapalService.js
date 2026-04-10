const axios = require('axios');

// ─── Base URLs ─────────────────────────────────────────────────
const SANDBOX_BASE = 'https://cybqa.pesapal.com/pesapalv3/api';
const LIVE_BASE = 'https://pay.pesapal.com/v3/api';

function getPesapalMode() {
  return process.env.PESAPAL_DEBUG === 'true' ? 'sandbox' : 'live';
}

function getBaseUrl() {
  return process.env.PESAPAL_DEBUG === 'true' ? SANDBOX_BASE : LIVE_BASE;
}

function maskSecret(value) {
  const text = String(value || '');
  if (!text) return '[missing]';
  if (text.length <= 6) return `${text.slice(0, 1)}***${text.slice(-1)}`;
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

// ─── Token cache ───────────────────────────────────────────────
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Authenticate with Pesapal and get a bearer token.
 * Token is cached until expiry (Pesapal tokens last ~5 minutes).
 * @returns {Promise<string>} bearer token
 */
async function getAccessToken() {
  const now = Date.now();

  // Return cached token if still valid (with 30 s buffer)
  if (cachedToken && now < tokenExpiresAt - 30_000) {
    return cachedToken;
  }

  const base = getBaseUrl();
  const mode = getPesapalMode();
  const consumerKey = process.env.PESAPAL_CONSUMER_KEY;
  const consumerSecret = process.env.PESAPAL_CONSUMER_SECRET;

  console.log(`[Pesapal] Requesting access token in ${mode.toUpperCase()} mode`);
  console.log(`[Pesapal] Base URL: ${base}`);
  console.log(`[Pesapal] Consumer key: ${maskSecret(consumerKey)}`);
  console.log(`[Pesapal] Consumer secret: ${maskSecret(consumerSecret)}`);

  const { data } = await axios.post(
    `${base}/Auth/RequestToken`,
    {
      consumer_key: consumerKey,
      consumer_secret: consumerSecret
    },
    { headers: { Accept: 'application/json', 'Content-Type': 'application/json' } }
  );

  if (data.error) {
    throw new Error(`Pesapal auth error: ${JSON.stringify(data.error)}`);
  }

  cachedToken = data.token;
  tokenExpiresAt = new Date(data.expiryDate).getTime();
  console.log('[Pesapal] Auth token obtained, expires', data.expiryDate);
  return cachedToken;
}

/**
 * Build auth headers for all subsequent calls
 */
async function authHeaders() {
  const token = await getAccessToken();
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };
}

// ─── IPN Registration ──────────────────────────────────────────
/**
 * Register an IPN URL with Pesapal (one-time setup).
 * After registering, store the returned ipn_id in your .env.
 * @returns {Promise<Object>} { ipn_id, url, ... }
 */
async function registerIPN() {
  const base = getBaseUrl();
  const headers = await authHeaders();

  const { data } = await axios.post(
    `${base}/URLSetup/RegisterIPN`,
    {
      url: process.env.PESAPAL_IPN_URL,
      ipn_notification_type: 'GET'
    },
    { headers }
  );

  if (data.error) {
    throw new Error(`Pesapal IPN registration error: ${JSON.stringify(data.error)}`);
  }

  console.log('[Pesapal] IPN registered:', data.ipn_id);
  return data;
}

/**
 * Get list of registered IPN URLs.
 * @returns {Promise<Array>}
 */
async function getRegisteredIPNs() {
  const base = getBaseUrl();
  const headers = await authHeaders();

  const { data } = await axios.get(`${base}/URLSetup/GetIpnList`, { headers });
  return data;
}

// ─── Submit Order Request ──────────────────────────────────────
/**
 * Create a payment order on Pesapal.
 * Returns a redirect_url to send the customer to.
 *
 * @param {Object} params
 * @param {string} params.merchantReference  – unique order ID (e.g. "SUB-clientId-serviceId-timestamp")
 * @param {number} params.amount
 * @param {string} params.currency           – default "KES"
 * @param {string} params.description
 * @param {string} params.callbackUrl        – where customer returns after paying
 * @param {string} params.accountNumber      – enables recurring (Pesapal links future payments to this)
 * @param {Object} params.subscriptionDetails – {start_date, end_date, frequency} for recurring payments
 * @param {Object} params.billingAddress     – { email_address, phone_number, first_name, last_name, country_code }
 * @returns {Promise<Object>} { order_tracking_id, merchant_reference, redirect_url }
 */
async function submitOrder({
  merchantReference,
  amount,
  currency = 'KES',
  description,
  callbackUrl,
  accountNumber,
  subscriptionDetails,
  billingAddress
}) {
  const base = getBaseUrl();
  const headers = await authHeaders();
  const ipnId = process.env.PESAPAL_IPN_ID;

  if (!ipnId) {
    throw new Error('PESAPAL_IPN_ID is not set. Run IPN registration first.');
  }

  const orderPayload = {
    id: merchantReference,
    currency,
    amount: parseFloat(amount),
    description: String(description).substring(0, 100),
    callback_url: callbackUrl || process.env.PESAPAL_CALLBACK_URL,
    notification_id: ipnId,
    billing_address: {
      email_address: billingAddress?.email_address || '',
      phone_number: billingAddress?.phone_number || '',
      country_code: billingAddress?.country_code || 'KE',
      first_name: billingAddress?.first_name || '',
      last_name: billingAddress?.last_name || ''
    }
  };

  // account_number enables Pesapal's customer-managed recurring billing
  if (accountNumber) {
    orderPayload.account_number = accountNumber;
  }

  // subscription_details pre-fills the recurring payment form in Pesapal iframe
  // Customer won't have to re-enter frequency/dates if we send these
  if (subscriptionDetails) {
    orderPayload.subscription_details = {
      start_date: subscriptionDetails.start_date,
      frequency: subscriptionDetails.frequency
    };
    // end_date is optional - if not provided, subscription continues indefinitely
    if (subscriptionDetails.end_date) {
      orderPayload.subscription_details.end_date = subscriptionDetails.end_date;
    }
    console.log('[Pesapal] Subscription details included:', orderPayload.subscription_details);
  }

  const { data } = await axios.post(
    `${base}/Transactions/SubmitOrderRequest`,
    orderPayload,
    { headers }
  );

  if (data.error) {
    throw new Error(`Pesapal SubmitOrder error: ${JSON.stringify(data.error)}`);
  }

  console.log('[Pesapal] Order submitted:', data.order_tracking_id, '→', data.redirect_url);
  return data;
}

// ─── Get Transaction Status ────────────────────────────────────
/**
 * Check the status of a Pesapal payment.
 *
 * status_code meanings:
 *   0 – INVALID
 *   1 – COMPLETED
 *   2 – FAILED
 *   3 – REVERSED
 *
 * @param {string} orderTrackingId – Pesapal order tracking ID
 * @returns {Promise<Object>} full transaction status object
 */
async function getTransactionStatus(orderTrackingId) {
  const base = getBaseUrl();
  const headers = await authHeaders();

  const { data } = await axios.get(
    `${base}/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`,
    { headers }
  );

  console.log(`[Pesapal] Transaction ${orderTrackingId} status:`, data.payment_status_description);
  return data;
}

module.exports = {
  getAccessToken,
  registerIPN,
  getRegisteredIPNs,
  submitOrder,
  getTransactionStatus
};
