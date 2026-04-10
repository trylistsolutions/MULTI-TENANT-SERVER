const express = require('express');
const router = express.Router();
const { manualTriggerInvoiceReminders } = require('../services/scheduler');

router.use('/api/clients', require('./clientsRoutes'));
router.use('/clients', require('./clientsRoutes'));
router.use('/single', require('./singleClientRoutes'));
router.use('/pesapal', require('./pesapalRoutes'));

router.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Binary server is running',
    timestamp: new Date().toISOString()
  });
});

// Manual trigger for invoice reminders (testing)
router.post('/api/invoice-reminders/trigger', async (req, res) => {
  try {
    const result = await manualTriggerInvoiceReminders();
    res.status(result.success ? 200 : 500).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to trigger invoice reminders',
      error: error.message
    });
  }
});

module.exports = router;