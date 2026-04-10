require('dotenv').config();

// Initialize Africa's Talking SDK
const credentials = {
  apiKey: process.env.AT_API_KEY || process.env.BINARY_AT_API_KEY,
  username: process.env.AT_USERNAME || process.env.BINARY_AT_USERNAME,
};

const AfricasTalking = require('africastalking')(credentials);
const sms = AfricasTalking.SMS;

/**
 * Sends an SMS notification to a client
 * @param {string} to - Recipient phone number in international format (+254...)
 * @param {string} message - The text body
 * @returns {Promise} Response from Africa's Talking API
 */
async function sendNotification(to, message) {
  try {
    if (!to) {
      throw new Error('Phone number is required');
    }

    console.log(`[SMS] Raw phone number received: "${to}"`);

    // Ensure phone is in international +254 (Kenya) format
    let normalizedPhone = String(to).trim();
    normalizedPhone = normalizedPhone.replace(/[^0-9+]/g, '');

    if (normalizedPhone.startsWith('0')) {
      // Local format 0791... -> +254791...
      normalizedPhone = `+254${normalizedPhone.slice(1)}`;
    } else if (normalizedPhone.startsWith('254')) {
      // 254791... -> +254791...
      normalizedPhone = `+${normalizedPhone}`;
    } else if (!normalizedPhone.startsWith('+')) {
      // 791... -> +254791...
      normalizedPhone = `+254${normalizedPhone}`;
    }

    console.log(`[SMS] Normalized phone number: "${normalizedPhone}"`);

    if (!/^\+254[0-9]{9}$/.test(normalizedPhone)) {
      throw new Error(`Invalid Kenya phone number format for Africa's Talking: "${to}" -> "${normalizedPhone}"`);
    }

    const options = {
      to: [normalizedPhone],
      message: message,
      // Omitting 'from' uses the FREE shared Sender ID from Africa's Talking
    };

    console.log(`[SMS] Sending to Africa's Talking with options:`, JSON.stringify(options));
    const response = await sms.send(options);
    console.log(`[SMS] Response from Africa's Talking:`, JSON.stringify(response));
    
    // Check actual delivery success
    const recipients = response?.SMSMessageData?.Recipients || [];
    const successRecipients = recipients.filter((r) => r.statusCode === '0');
    const failedRecipients = recipients.filter((r) => r.statusCode !== '0');

    console.log(`[SMS] Successfully sent to ${successRecipients.length}/${recipients.length} recipient(s)`);

    if (failedRecipients.length > 0) {
      const errors = failedRecipients.map((r) => `${r.number} (${r.status} / ${r.statusCode})`).join(', ');
      const err = new Error(`SMS delivery failure for ${failedRecipients.length}/${recipients.length} recipient(s): ${errors}`);
      err.details = { recipients, failedRecipients };
      throw err;
    }

    return response;
  } catch (error) {
    console.error(`[SMS] Error:`, error.message);
    throw error;
  }
}

module.exports = { sendNotification };
