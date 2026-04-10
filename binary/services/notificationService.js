const { getDueInvoices, markNotificationSent } = require('./invoiceService');
const { sendNotification } = require('./smsService');
const { sendInvoiceReminder } = require('./emailService');

/**
 * Generate invoice reminder email template
 * @param {string} clientName - Client name
 * @param {Array} dueInvoices - Array of due invoices
 * @returns {string} HTML email content
 */
function generateInvoiceReminderTemplate(clientName, dueInvoices) {
  const totalAmount = dueInvoices.reduce((sum, inv) => sum + inv.invoice.amount, 0);
  const invoiceCount = dueInvoices.length;

  const invoicesList = dueInvoices
    .map((inv) => {
      const year = inv.cycleLength === 'MONTHLY' ? new Date().getFullYear() : inv.invoice.period;
      return `<li>${inv.serviceName} - ${inv.invoice.period} (${year}) - KES ${inv.invoice.amount}</li>`;
    })
    .join('');

  return `
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
          <p>This is a reminder that you have <strong>${invoiceCount}</strong> outstanding invoice(s) that are now due for payment.</p>
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
}

/**
 * Format SMS message for invoice reminder
 * @param {string} clientName - Client name
 * @param {number} invoiceCount - Number of due invoices
 * @param {number} totalAmount - Total amount due
 * @returns {string} SMS message
 */
function formatInvoiceSMSMessage(clientName, invoiceCount, totalAmount) {
  return `Hello ${clientName},\n\nReminder: You have ${invoiceCount} outstanding invoice(s) due for payment.\n\nTotal due: KES ${totalAmount}\n\nPlease make payment to avoid service interruption.\n\nBinary Bros`;
}

/**
 * Send notifications for due invoices
 */
async function sendInvoiceReminders() {
  try {
    console.log('[Invoice Reminder] Job started at', new Date().toISOString());

    const dueInvoices = await getDueInvoices();
    console.log(`[Invoice Reminder] Found ${dueInvoices.length} due invoices (pending+dueDate<=now)`);

    const now = new Date();
    const overdueInvoices = dueInvoices.filter((item) => {
      if (!item?.invoice) return false;
      const invoiceDate = new Date(item.invoice.dueDate);
      return item.invoice.status === 'pending' && invoiceDate < now;
    });

    console.log(`[Invoice Reminder] Overdue invoices (pending+past due): ${overdueInvoices.length}`);

    // Group all overdue invoices by client (no per-client limit)
    const clientInvoices = {};

    overdueInvoices.forEach((item) => {
      const clientId = item.clientId.toString();
      if (!clientInvoices[clientId]) {
        clientInvoices[clientId] = {
          clientName: item.clientName,
          contact: item.contact,
          invoices: []
        };
      }

      clientInvoices[clientId].invoices.push(item);
    });

    let processed = 0;
    let emailSent = 0;
    let smsSent = 0;

    // Process each client
    for (const clientId in clientInvoices) {
      const clientData = clientInvoices[clientId];
      processed++;

      try {
        const { phone, email } = clientData.contact || {};
        const invoiceCount = clientData.invoices.length;
        const totalAmount = clientData.invoices.reduce((sum, inv) => sum + inv.invoice.amount, 0);

        // Send email if available and there are unsent invoice reminders
        if (email) {
          const unsentEmailInvoices = clientData.invoices.filter(inv => !inv.invoice.emailSent);
          if (unsentEmailInvoices.length > 0) {
            console.log(`[${processed}/${Object.keys(clientInvoices).length}] ${clientData.clientName}: Will send email to ${email} for ${unsentEmailInvoices.length} invoice(s) not yet emailed.`);
            unsentEmailInvoices.forEach((inv) => {
              console.log(`  -> invoice: service=${inv.serviceName}, period=${inv.invoice.period}, due=${inv.invoice.dueDate}, amount=${inv.invoice.amount}, emailSent=${inv.invoice.emailSent}`);
            });

            try {
              await sendInvoiceReminder(email, clientData.clientName, unsentEmailInvoices);
              console.log(`[${processed}/${Object.keys(clientInvoices).length}] ${clientData.clientName}: Email successfully sent to ${email}`);

              for (const inv of unsentEmailInvoices) {
                await markNotificationSent(clientId, inv.serviceId, inv.invoice.period, 'email');
              }
              emailSent++;
            } catch (emailError) {
              console.error(`[${processed}/${Object.keys(clientInvoices).length}] ${clientData.clientName}: Email send failed to ${email} -`, emailError.message);
            }
          } else {
            console.log(`[${processed}/${Object.keys(clientInvoices).length}] ${clientData.clientName}: No unsent overdue email invoice items; email not sent.`);
          }
        }

        // SMS notifications are currently disabled because Africa's Talking is in blacklist condition.
        if (phone) {
          console.log(`[${processed}/${Object.keys(clientInvoices).length}] ${clientData.clientName}: SMS sending is disabled as requested. Skipping SMS to ${phone}.`);
        }

      } catch (clientError) {
        console.error(`[${processed}/${Object.keys(clientInvoices).length}] ${clientData.clientName}: Error processing client -`, clientError.message);
      }
    }

    console.log('[Invoice Reminder] Job completed at', new Date().toISOString());
    console.log(`Summary: Processed=${processed}, Emails=${emailSent}, SMS=${smsSent}`);

    return {
      success: true,
      processedClients: processed,
      emailsSent: emailSent,
      smsSent: smsSent
    };
  } catch (error) {
    console.error('[Invoice Reminder] Job failed:', error.message);
    throw error;
  }
}

module.exports = {
  sendInvoiceReminders,
  generateInvoiceReminderTemplate,
  formatInvoiceSMSMessage
};