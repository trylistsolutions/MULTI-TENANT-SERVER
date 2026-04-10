const nodemailer = require('nodemailer');

// Create transporter using Binary Gmail config
const transporter = nodemailer.createTransport({
  service: 'gmail',
  port: 465,
  secure: true,
  logger: true,
  debug: false,
  secureConnection: false,
  auth: {
    user: process.env.BINARY_EMAIL,
    pass: process.env.BINARY_EMAIL_PASSWORD,
  },
  tls: {
    rejectUnauthorized: true
  }
});

/**
 * Generate HTML email template for cycle payment reminder
 * @param {string} clientName - Client name
 * @param {Array} services - Array of services that need renewal
 * @param {Date} renewalDate - Date when payment will be due
 * @returns {string} HTML email content
 */
function generateCyclePaymentTemplate(clientName, services, renewalDate) {
  const formattedDate = renewalDate.toLocaleDateString('en-KE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const servicesList = services
    .map((s) => `<li>${s.serviceName} (${s.cycleLength} - KES ${s.monthlyCost})</li>`)
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Reminder - Nairobi Zoezi Institute</title>
      <style>
        body { font-family: 'Arial', sans-serif; background-color: #f5f5f5; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { color: #1f2937; font-size: 24px; font-weight: bold; margin-bottom: 20px; border-bottom: 3px solid #3b82f6; padding-bottom: 15px; }
        .content { color: #4b5563; line-height: 1.6; margin-bottom: 20px; }
        .services-box { background-color: #f0f9ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px; }
        .services-box ul { margin: 10px 0; padding-left: 20px; }
        .services-box li { margin: 8px 0; }
        .renewal-notice { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; font-weight: bold; }
        .footer { font-size: 12px; color: #9ca3af; text-align: center; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 15px; }
        .button { display: inline-block; background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 15px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">Payment Reminder - Nairobi Zoezi Institute</div>
        
        <div class="content">
          <p>Dear <strong>${clientName}</strong>,</p>
          <p>This is a friendly reminder that you have active service(s) scheduled for renewal or payment on <strong>${formattedDate}</strong>.</p>
        </div>

        <div class="services-box">
          <strong>Services Due for Renewal:</strong>
          <ul>
            ${servicesList}
          </ul>
        </div>

        <div class="renewal-notice">
          ⚠️ Please ensure funds are available in your M-PESA account or payment method on or before <strong>${formattedDate}</strong>.
        </div>

        <div class="content">
          <p>If you have any questions or need to modify your payment schedule, please contact our support team immediately.</p>
          <a href="mailto:${process.env.ADMIN_EMAIL}" class="button">Contact Support</a>
        </div>

        <div class="footer">
          <p>This is an automated message from Nairobi Zoezi Institute. Please do not reply to this email.</p>
          <p>&copy; ${new Date().getFullYear()} Nairobi Zoezi Institute. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send cycle payment reminder email
 * @param {string} toEmail - Recipient email
 * @param {string} clientName - Client name
 * @param {Array} services - Array of services
 * @param {Date} renewalDate - Renewal date
 * @returns {Promise}
 */
async function sendCyclePaymentReminder(toEmail, clientName, services, renewalDate) {
  try {
    if (!toEmail) {
      throw new Error('Email address is required');
    }

    const htmlContent = generateCyclePaymentTemplate(clientName, services, renewalDate);

    const mailOptions = {
      from: process.env.BINARY_EMAIL,
      to: toEmail,
      subject: `Cycle Payment Reminder - ${clientName} - Binary Bros`,
      html: htmlContent,
      replyTo: process.env.BINARY_ADMIN_EMAIL
    };

    const response = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', response.messageId);
    return response;
  } catch (error) {
    console.error('Email send failed:', error.message);
    throw error;
  }
}

/**
 * Send invoice reminder email
 * @param {string} toEmail - Recipient email
 * @param {string} clientName - Client name
 * @param {Array} dueInvoices - Array of due invoices
 * @returns {Promise}
 */
async function sendInvoiceReminder(toEmail, clientName, dueInvoices) {
  try {
    if (!toEmail) {
      throw new Error('Email address is required');
    }

    console.log(`[Email] Preparing to send invoice reminder to: "${toEmail}"`);
    console.log(`[Email] From address: "${process.env.BINARY_EMAIL}"`);
    console.log(`[Email] Auth username: "${process.env.BINARY_EMAIL || 'NOT SET'}"`);
    console.log(`[Email] Auth password length: ${(process.env.BINARY_EMAIL_PASSWORD || '').length} chars`);

    const totalAmount = dueInvoices.reduce((sum, inv) => sum + inv.invoice.amount, 0);
    const invoiceCount = dueInvoices.length;

    const invoicesList = dueInvoices
      .map((inv) => {
        const invoiceDate = inv.invoice.dueDate ? new Date(inv.invoice.dueDate) : null;
        const dueDateText = invoiceDate ? invoiceDate.toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Unknown';

        let periodLabel = inv.invoice.period;
        if (inv.cycleLength === 'MONTHLY') {
          const monthIndex = Number(inv.invoice.period) - 1;
          if (monthIndex >= 0 && monthIndex < 12) {
            periodLabel = `${new Date(0, monthIndex).toLocaleString('en-KE', { month: 'long' })} ${new Date().getFullYear()}`;
          }
        }

        if (inv.cycleLength === 'YEARLY') {
          periodLabel = `${inv.invoice.period}`;
        }

        return `<li><strong>${inv.serviceName}</strong> — ${periodLabel} — KES ${inv.invoice.amount} — Due ${dueDateText}</li>`;
      })
      .join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invoice Payment Reminder - Binary Bros</title>
        <style>
          body { font-family: 'Arial', sans-serif; background-color: #f5f5f5; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .header { color: #1f2937; font-size: 24px; font-weight: bold; margin-bottom: 20px; border-bottom: 3px solid #3b82f6; padding-bottom: 15px; }
          .content { color: #4b5563; line-height: 1.6; margin-bottom: 20px; }
          .invoices-box { background-color: #f0f9ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .invoices-box ul { margin: 10px 0; padding-left: 20px; }
          .invoices-box li { margin: 8px 0; }
          .total-amount { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; font-weight: bold; font-size: 18px; }
          .footer { font-size: 12px; color: #9ca3af; text-align: center; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 15px; }
          .button { display: inline-block; background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">Invoice Payment Reminder - Binary Bros</div>

          <div class="content">
            <p>Dear <strong>${clientName}</strong>,</p>
            <p>This is a reminder that you have <strong>${invoiceCount}</strong> overdue invoice(s) (all due invoices are included here).</p>
          </div>

          <div class="invoices-box">
            <strong>Due Invoices:</strong>
            <ul>
              ${invoicesList}
            </ul>
          </div>

          <div class="total-amount">
            Total Amount Due: KES ${totalAmount}
          </div>

          <div class="content">
            <p>Please ensure payment is made as soon as possible to avoid service interruption.</p>
            <p>If you have any questions or need assistance, please contact our support team immediately.</p>
            <a href="mailto:admin@binarybroske.com" class="button">Contact Support</a>
          </div>

          <div class="footer">
            <p>This is an automated message from Binary Bros. Please do not reply to this email.</p>
            <p>&copy; ${new Date().getFullYear()} Binary Bros. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: process.env.BINARY_EMAIL,
      to: toEmail,
      subject: `Invoice Payment Reminder - ${clientName} - Binary Bros`,
      html: htmlContent,
      replyTo: process.env.BINARY_ADMIN_EMAIL
    };

    console.log(`[Email] Mail options:`, { to: mailOptions.to, from: mailOptions.from, subject: mailOptions.subject });
    console.log(`[Email] Calling transporter.sendMail(...)`);

    const response = await transporter.sendMail(mailOptions);
    console.log(`[Email] Successfully sent! Message ID:`, response.messageId);
    return response;
  } catch (error) {
    console.error(`[Email] Failed to send:`, error.message);
    throw error;
  }
}

module.exports = { sendCyclePaymentReminder, generateCyclePaymentTemplate, sendInvoiceReminder };
