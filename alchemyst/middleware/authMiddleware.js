const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const Escort = require('../models/Escort');
const Masseuse = require('../models/Masseuse');
const OFModel = require('../models/OFModel');
const Spa = require('../models/Spa');

const authenticateToken = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token required'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.ALCHEMYST_JWT_SECRET || 'your-fallback-secret-key');
    
    // Find user in all collections
    const users = await Promise.all([
      Escort.findById(decoded.userId),
      Masseuse.findById(decoded.userId),
      OFModel.findById(decoded.userId),
      Spa.findById(decoded.userId)
    ]);

    // Find the first non-null user
    let user = null;
    let userType = null;
    const validUserTypes = ['escort', 'masseuse', 'of-model', 'spa'];

    for (let i = 0; i < users.length; i++) {
      if (users[i]) {
        user = users[i];
        userType = validUserTypes[i];
        break;
      }
    }
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    req.user = user;
    req.userType = userType;
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
});

module.exports = { authenticateToken };