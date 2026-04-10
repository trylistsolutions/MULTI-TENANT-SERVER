const express = require('express');
const asyncHandler = require('express-async-handler');
const Alumni = require('../models/alumni');
const router = express.Router();

// Get all users
router.get('/', asyncHandler(async (req, res) => {
  try {
    const alumni = await Alumni.find();
    res.json({ success: true, message: "Alumni retrieved successfully.", data: alumni });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));

module.exports = router;