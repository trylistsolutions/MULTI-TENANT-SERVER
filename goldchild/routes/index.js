const express = require('express');

const router = express.Router();

router.use('/api/applications', require('./studentApplicationRoutes'));
router.use('/applications', require('./studentApplicationRoutes'));
router.use('/api/admin', require('./adminRoutes'));
router.use('/api/courses', require('./courseRoutes'));
router.use('/api/students', require('./studentRoutes'));

router.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Goldchild server is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
