const express = require('express');
const asyncHandler = require('express-async-handler');
const Escort = require('../models/Escort');
const Masseuse = require('../models/Masseuse');
const OFModel = require('../models/OFModel');
const Spa = require('../models/Spa');

const router = express.Router();

// Model mapping
const getModelByType = (userType) => {
  console.log(`Getting model for userType: ${userType}`);
  switch (userType) {
    case 'escort':
      return Escort;
    case 'masseuse':
      return Masseuse;
    case 'of-model':
      return OFModel;
    case 'spa':
      return Spa;
    default:
      console.warn(`Unknown userType: ${userType}`);
      return null;
  }
};

// Track profile view
router.post('/view', asyncHandler(async (req, res) => {
  console.log(`Route Hit`);
  const { profileId } = req.body;
  console.log('=== POST /analytics/view - START ===');

  if (!profileId) {
    return res.status(400).json({
      success: false,
      message: 'Profile ID is required'
    });
  }

  try {
    // Search across all models to find the profile
    const models = [
      { model: Escort, type: 'escort' },
      { model: Masseuse, type: 'masseuse' },
      { model: OFModel, type: 'of-model' },
      { model: Spa, type: 'spa' }
    ];

    let userType = null;
    let profileFound = false;

    for (const { model, type } of models) {
      const profile = await model.findById(profileId);
      if (profile) {
        userType = type;
        
        // Update analytics for profile view
        await model.findByIdAndUpdate(profileId, {
          $inc: { 
            'analytics.views': 1,
            'analytics.profile_views': 1
          },
          $set: { 'analytics.lastViewed': new Date() },
          $push: {
            'analytics.interactionHistory': {
              type: 'profile_view',
              timestamp: new Date()
            }
          }
        });

        profileFound = true;
        console.log(`Tracked view for ${type} profile: ${profileId}`);
        break;
      }
    }

    if (!profileFound) {
      console.log('Profile not found for view tracking');
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    console.log('=== POST /analytics/view - SUCCESS ===');
    res.json({
      success: true,
      message: 'View tracked successfully'
    });

  } catch (error) {
    console.error('=== POST /analytics/view - ERROR ===');
    console.error('View tracking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track view',
      error: error.message
    });
  }
}));

// Track user interactions
router.post('/interaction', asyncHandler(async (req, res) => {
  const { profileId, interactionType } = req.body;
  console.log('=== POST /analytics/interaction - START ===');

  if (!profileId || !interactionType) {
    return res.status(400).json({
      success: false,
      message: 'Profile ID and interaction type are required'
    });
  }

  const validInteractions = ['phone_copy', 'call', 'whatsapp', 'profile_view', 'message'];
  
  if (!validInteractions.includes(interactionType)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid interaction type'
    });
  }

  try {
    // Search across all models to find the profile
    const models = [
      { model: Escort, type: 'escort' },
      { model: Masseuse, type: 'masseuse' },
      { model: OFModel, type: 'of-model' },
      { model: Spa, type: 'spa' }
    ];

    let userType = null;
    let profileFound = false;

    for (const { model, type } of models) {
      const profile = await model.findById(profileId);
      if (profile) {
        userType = type;
        
        // Update analytics based on interaction type
        const updateData = {
          $inc: { 
            'analytics.interactions': 1
          },
          $push: {
            'analytics.interactionHistory': {
              type: interactionType,
              timestamp: new Date()
            }
          }
        };

        // Increment specific counter based on interaction type
        if (interactionType === 'phone_copy') {
          updateData.$inc['analytics.phone_copies'] = 1;
        } else if (interactionType === 'call') {
          updateData.$inc['analytics.calls'] = 1;
        } else if (interactionType === 'whatsapp') {
          updateData.$inc['analytics.whatsapps'] = 1;
        } else if (interactionType === 'message') {
          updateData.$inc['analytics.messages'] = 1;
        }

        await model.findByIdAndUpdate(profileId, updateData);

        profileFound = true;
        console.log(`Tracked ${interactionType} interaction for ${type} profile: ${profileId}`);
        break;
      }
    }

    if (!profileFound) {
      console.log('Profile not found for interaction tracking');
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    console.log('=== POST /analytics/interaction - SUCCESS ===');
    res.json({
      success: true,
      message: 'Interaction tracked successfully'
    });

  } catch (error) {
    console.error('=== POST /analytics/interaction - ERROR ===');
    console.error('Interaction tracking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track interaction',
      error: error.message
    });
  }
}));

// Get analytics for a profile (optional - for admin purposes)
router.get('/:profileId', asyncHandler(async (req, res) => {
  const { profileId } = req.params;
  console.log(`=== GET /analytics/${profileId} - START ===`);

  try {
    const models = [
      { model: Escort, type: 'escort' },
      { model: Masseuse, type: 'masseuse' },
      { model: OFModel, type: 'of-model' },
      { model: Spa, type: 'spa' }
    ];

    let analytics = null;
    let userType = null;

    for (const { model, type } of models) {
      const profile = await model.findById(profileId).select('analytics userType');
      if (profile) {
        analytics = profile.analytics;
        userType = type;
        break;
      }
    }

    if (!analytics) {
      return res.status(404).json({
        success: false,
        message: 'Analytics not found for profile'
      });
    }

    console.log('=== GET /analytics/:profileId - SUCCESS ===');
    res.json({
      success: true,
      data: {
        analytics,
        userType
      }
    });

  } catch (error) {
    console.error('=== GET /analytics/:profileId - ERROR ===');
    console.error('Analytics fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
}));

module.exports = router;