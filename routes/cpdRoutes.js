// routes/cpdRoutes.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Alumni = require('../models/Alumni');

// Get CPD records for a user (student or alumni)
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { userType } = req.query;

    if (!userId || !userType) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID and userType are required'
      });
    }

    let user;
    if (userType === 'alumni') {
      user = await Alumni.findById(userId);
    } else if (userType === 'student') {
      user = await User.findById(userId);
    } else {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid userType. Must be "student" or "alumni"'
      });
    }

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Get CPD records sorted by year (descending)
    const cpdRecords = user.cpdRecords || [];
    cpdRecords.sort((a, b) => b.year - a.year);
    
    console.log(`Fetched ${cpdRecords} CPD records for user ${userId}`);

    res.status(200).json({
      status: 'success',
      data: cpdRecords
    });

  } catch (error) {
    console.error('Error fetching CPD records:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch CPD records'
    });
  }
});

module.exports = router;