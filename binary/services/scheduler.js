const { sendInvoiceReminders } = require('./notificationService');
const cron = require('node-cron');

/**
 * Binary recurring billing now relies on Pesapal customer-managed recurring
 * payments plus IPN callbacks. Local cron-based collection/reminder jobs are
 * intentionally disabled.
 *
 * However, invoice-based reminders are enabled for better client communication.
 */

function initializeCyclePaymentScheduler() {
  console.log('[Scheduler] Disabled. Pesapal recurring payments + IPN are the active billing flow.');
}

async function manualTriggerCyclePaymentReminder() {
  return {
    success: false,
    disabled: true,
    message: 'Cycle payment reminder cron is disabled. Use Pesapal recurring billing and IPN callbacks instead.'
  };
}

/**
 * Initialize monthly invoice reminder scheduler
 * Runs on the 1st day of every month at 00:01 AM
 */
function initializeInvoiceReminderScheduler() {
  // Run on the 1st of every month at 00:01 AM
  const cronSchedule = '1 0 1 * *';

  // console.log('[Monthly Invoice Reminder Scheduler] Initialized. Will run on the 1st of every month at 00:01 AM.');

  // Schedule the monthly invoice reminder job
  cron.schedule(cronSchedule, async () => {
    try {
      console.log('[Monthly Invoice Reminder] Starting automated monthly reminder process...');
      const result = await sendInvoiceReminders();
      console.log('[Monthly Invoice Reminder] Completed successfully. Processed clients:', result?.processedClients || 'unknown');
    } catch (error) {
      console.error('[Monthly Invoice Reminder] Failed:', error);
    }
  }, {
    timezone: "Africa/Nairobi" // Set timezone to East Africa Time
  });

  // For development/testing, you can uncomment the line below to run every minute
  // const cronSchedule = '* * * * *';
  // cron.schedule(cronSchedule, async () => {
  //   console.log('[Monthly Invoice Reminder] TEST RUN - Starting...');
  //   await sendInvoiceReminders();
  //   console.log('[Monthly Invoice Reminder] TEST RUN - Completed');
  // });
}

/**
 * Manual trigger for invoice reminders (for testing)
 */
async function manualTriggerInvoiceReminders() {
  try {
    console.log('[Invoice Reminder] Manual trigger started');
    const result = await sendInvoiceReminders();
    return {
      success: true,
      message: 'Invoice reminders processed successfully',
      processedClients: result?.processedClients || 0
    };
  } catch (error) {
    console.error('[Invoice Reminder] Manual trigger failed:', error);
    return {
      success: false,
      message: 'Failed to process invoice reminders',
      error: error.message
    };
  }
}

module.exports = {
  initializeCyclePaymentScheduler,
  manualTriggerCyclePaymentReminder,
  initializeInvoiceReminderScheduler,
  manualTriggerInvoiceReminders
};
