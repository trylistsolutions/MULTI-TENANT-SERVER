const express = require('express');
const asyncHandler = require('express-async-handler');
const Escort = require('../models/Escort');
const Masseuse = require('../models/Masseuse');
const OFModel = require('../models/OFModel');
const Spa = require('../models/Spa');

const router = express.Router();

// Model mapping
const getModelByType = (userType) => {
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

// Get ALL active profiles at once (no pagination, no filters)
router.get('/all', asyncHandler(async (req, res) => {
    try {
        // Base filter for active profiles only
        const baseFilter = {
            isActive: true,
            'currentPackage.status': 'active'
        };

        console.log('Base filter:', baseFilter);

        // All models to search
        const modelsToSearch = [
            { model: Escort, type: 'escort' },
            { model: Masseuse, type: 'masseuse' },
            { model: OFModel, type: 'of-model' },
            { model: Spa, type: 'spa' }
        ];

        let allProfiles = [];

        // Search across ALL models
        for (const { model, type } of modelsToSearch) {
            console.log(`\n--- Fetching all ${type} profiles ---`);

            const profiles = await model.find(baseFilter)
                .select('-password -email -paymentHistory -processedTransactions')
                .sort({
                    'currentPackage.packageType': -1,
                    createdAt: -1
                })
                .lean();

            console.log(`Fetched ${profiles.length} profiles from ${type} model`);

            // Add userType to each profile
            const typedProfiles = profiles.map(profile => ({
                ...profile,
                userType: type
            }));

            allProfiles = [...allProfiles, ...typedProfiles];
        }

        console.log(`\nTotal profiles fetched: ${allProfiles.length}`);

        // Sort all profiles by package priority
        const packagePriority = { 'elite': 3, 'premium': 2, 'basic': 1, null: 0 };
        allProfiles.sort((a, b) => {
            const aPriority = packagePriority[a.currentPackage?.packageType] || 0;
            const bPriority = packagePriority[b.currentPackage?.packageType] || 0;
            return bPriority - aPriority;
        });

        // Increment profile views in background (don't wait)
        Promise.all(
            allProfiles.map(profile =>
                incrementProfileViews(profile._id, profile.userType)
            )
        ).catch(err => console.error('Error incrementing views:', err));

        console.log('=== GET /profiles/all - SUCCESS ===');
        res.json({
            success: true,
            profiles: allProfiles,
            totalCount: allProfiles.length,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('=== GET /profiles/all - ERROR ===');
        console.error('Profiles fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch profiles',
            error: error.message
        });
    }
}));


router.get('/expired', asyncHandler(async (req, res) => {
    try {
        // Base filter for active profiles only
        const baseFilter = {
            'currentPackage.status': 'expired'
        };

        console.log('Base filter:', baseFilter);

        // All models to search
        const modelsToSearch = [
            { model: Escort, type: 'escort' },
            { model: Masseuse, type: 'masseuse' },
            { model: OFModel, type: 'of-model' },
            { model: Spa, type: 'spa' }
        ];

        let allProfiles = [];

        // Search across ALL models
        for (const { model, type } of modelsToSearch) {
            console.log(`\n--- Fetching all ${type} profiles ---`);

            const profiles = await model.find(baseFilter)
                .select('-password -paymentHistory -processedTransactions')
                .sort({
                    'currentPackage.packageType': -1,
                    createdAt: -1
                })
                .lean();

            console.log(`Fetched ${profiles.length} profiles from ${type} model`);

            // Add userType to each profile
            const typedProfiles = profiles.map(profile => ({
                ...profile,
                userType: type
            }));

            allProfiles = [...allProfiles, ...typedProfiles];
        }

        console.log(`\nTotal profiles fetched: ${allProfiles.length}`);

        // Sort all profiles by package priority
        const packagePriority = { 'elite': 3, 'premium': 2, 'basic': 1, null: 0 };
        allProfiles.sort((a, b) => {
            const aPriority = packagePriority[a.currentPackage?.packageType] || 0;
            const bPriority = packagePriority[b.currentPackage?.packageType] || 0;
            return bPriority - aPriority;
        });

        // Increment profile views in background (don't wait)
        Promise.all(
            allProfiles.map(profile =>
                incrementProfileViews(profile._id, profile.userType)
            )
        ).catch(err => console.error('Error incrementing views:', err));

        console.log('=== GET /profiles/all - SUCCESS ===');
        res.json({
            success: true,
            profiles: allProfiles,
            totalCount: allProfiles.length,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('=== GET /profiles/all - ERROR ===');
        console.error('Profiles fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch profiles',
            error: error.message
        });
    }
}));


// FIXED: Two separate routes for location - one with county only, one with county and location
router.get('/location/:county', asyncHandler(async (req, res) => {
    console.log('=== GET /profiles/location/:county - START ===');
    console.log('Params:', req.params);
    console.log('Query:', req.query);

    const { county } = req.params;
    const { area, page = 1, limit = 20, userType = 'all' } = req.query;

    try {
        // FIXED: Using correct field names and structure
        const filter = {
            isActive: true,
            'currentPackage.status': 'active',
            'location.county': new RegExp(county, 'i')
        };

        console.log('Base location filter:', filter);

        if (area && area !== 'all') {
            filter['location.area'] = new RegExp(area, 'i');
            console.log(`Added area filter: ${area}`);
        }

        let modelsToSearch = [];
        if (userType === 'all') {
            modelsToSearch = [
                { model: Escort, type: 'escort' },
                { model: Masseuse, type: 'masseuse' },
                { model: OFModel, type: 'of-model' },
                { model: Spa, type: 'spa' }
            ];
            console.log('Searching ALL models for location');
        } else {
            const Model = getModelByType(userType);
            if (Model) {
                modelsToSearch.push({ model: Model, type: userType });
                console.log(`Searching only ${userType} model for location`);
            }
        }

        const skip = (page - 1) * parseInt(limit);
        let allProfiles = [];
        let totalCount = 0;

        console.log(`Pagination - skip: ${skip}, limit: ${limit}`);

        for (const { model, type } of modelsToSearch) {
            console.log(`\n--- Searching ${type} model for location ---`);
            console.log(`Filter for ${type}:`, JSON.stringify(filter, null, 2));

            const count = await model.countDocuments(filter);
            console.log(`Total ${type} profiles matching filter: ${count}`);
            totalCount += count;

            const profiles = await model.find(filter)
                .select('-password -email -paymentHistory -processedTransactions')
                .sort({
                    'currentPackage.packageType': -1,
                    createdAt: -1
                })
                .skip(skip)
                .limit(parseInt(limit))
                .lean();

            console.log(`Fetched ${profiles.length} profiles from ${type} model`);

            const typedProfiles = profiles.map(profile => ({
                ...profile,
                userType: type
            }));

            allProfiles = [...allProfiles, ...typedProfiles];
        }

        console.log(`Total profiles fetched: ${allProfiles.length}, Total matching: ${totalCount}`);

        // Sort by package priority - FIXED: Using correct field path
        const packagePriority = { 'elite': 3, 'premium': 2, 'basic': 1, null: 0 };
        allProfiles.sort((a, b) => {
            const aPriority = packagePriority[a.currentPackage?.packageType] || 0;
            const bPriority = packagePriority[b.currentPackage?.packageType] || 0;
            return bPriority - aPriority;
        });

        // Increment views
        console.log('Incrementing profile views for location search...');
        await Promise.all(
            allProfiles.map(profile =>
                incrementProfileViews(profile._id, profile.userType)
            )
        );

        console.log('=== GET /profiles/location/:county - SUCCESS ===');
        res.json({
            success: true,
            data: {
                profiles: allProfiles,
                location: {
                    county,
                    area: area && area !== 'all' ? area : null
                },
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: totalCount,
                    hasMore: (skip + allProfiles.length) < totalCount
                }
            }
        });

    } catch (error) {
        console.error('=== GET /profiles/location/:county - ERROR ===');
        console.error('Location profiles fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch location profiles',
            error: error.message
        });
    }
}));

// FIXED: Separate route for county + location combination
router.get('/location/:county/:location', asyncHandler(async (req, res) => {
    console.log('=== GET /profiles/location/:county/:location - START ===');
    console.log('Params:', req.params);
    console.log('Query:', req.query);

    const { county, location } = req.params;
    const { area, page = 1, limit = 20, userType = 'all' } = req.query;

    try {
        // FIXED: Using correct field names and structure
        const filter = {
            isActive: true,
            'currentPackage.status': 'active',
            'location.county': new RegExp(county, 'i'),
            'location.location': new RegExp(location, 'i') // FIXED: was 'subCounty'
        };

        console.log('Base location filter:', filter);

        if (area && area !== 'all') {
            filter['location.area'] = new RegExp(area, 'i');
            console.log(`Added area filter: ${area}`);
        }

        let modelsToSearch = [];
        if (userType === 'all') {
            modelsToSearch = [
                { model: Escort, type: 'escort' },
                { model: Masseuse, type: 'masseuse' },
                { model: OFModel, type: 'of-model' },
                { model: Spa, type: 'spa' }
            ];
            console.log('Searching ALL models for location');
        } else {
            const Model = getModelByType(userType);
            if (Model) {
                modelsToSearch.push({ model: Model, type: userType });
                console.log(`Searching only ${userType} model for location`);
            }
        }

        const skip = (page - 1) * parseInt(limit);
        let allProfiles = [];
        let totalCount = 0;

        console.log(`Pagination - skip: ${skip}, limit: ${limit}`);

        for (const { model, type } of modelsToSearch) {
            console.log(`\n--- Searching ${type} model for location ---`);
            console.log(`Filter for ${type}:`, JSON.stringify(filter, null, 2));

            const count = await model.countDocuments(filter);
            console.log(`Total ${type} profiles matching filter: ${count}`);
            totalCount += count;

            const profiles = await model.find(filter)
                .select('-password -email -paymentHistory -processedTransactions')
                .sort({
                    'currentPackage.packageType': -1,
                    createdAt: -1
                })
                .skip(skip)
                .limit(parseInt(limit))
                .lean();

            console.log(`Fetched ${profiles.length} profiles from ${type} model`);

            const typedProfiles = profiles.map(profile => ({
                ...profile,
                userType: type
            }));

            allProfiles = [...allProfiles, ...typedProfiles];
        }

        console.log(`Total profiles fetched: ${allProfiles.length}, Total matching: ${totalCount}`);

        // Sort by package priority - FIXED: Using correct field path
        const packagePriority = { 'elite': 3, 'premium': 2, 'basic': 1, null: 0 };
        allProfiles.sort((a, b) => {
            const aPriority = packagePriority[a.currentPackage?.packageType] || 0;
            const bPriority = packagePriority[b.currentPackage?.packageType] || 0;
            return bPriority - aPriority;
        });

        // Increment views
        console.log('Incrementing profile views for location search...');
        await Promise.all(
            allProfiles.map(profile =>
                incrementProfileViews(profile._id, profile.userType)
            )
        );

        console.log('=== GET /profiles/location/:county/:location - SUCCESS ===');
        res.json({
            success: true,
            data: {
                profiles: allProfiles,
                location: {
                    county,
                    location,
                    area: area && area !== 'all' ? area : null
                },
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: totalCount,
                    hasMore: (skip + allProfiles.length) < totalCount
                }
            }
        });

    } catch (error) {
        console.error('=== GET /profiles/location/:county/:location - ERROR ===');
        console.error('Location profiles fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch location profiles',
            error: error.message
        });
    }
}));

// Get single profile by userType and ID (for React component)
router.get('/:userType/:id', asyncHandler(async (req, res) => {
  const { userType, id } = req.params;
  console.log(`=== GET /profiles/${userType}/${id} - START ===`);

  try {
    const Model = getModelByType(userType);
    
    if (!Model) {
      console.log(`Invalid userType: ${userType}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid user type'
      });
    }

    console.log(`Searching for ${userType} profile with ID: ${id}`);
    
    const profile = await Model.findById(id)
      .select('-password -paymentHistory -processedTransactions -emailVerificationCode -emailVerificationExpires')
      .lean();

    if (!profile) {
      console.log('Profile not found');
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    // Check if profile is active and has active package
    if (!profile.isActive || profile.currentPackage?.status !== 'active') {
      console.log('Profile is not active or does not have active package');
      return res.status(404).json({
        success: false,
        message: 'Profile not available'
      });
    }

    profile.userType = userType;

    // Increment profile views
    console.log('Incrementing profile views for single profile...');
    await incrementProfileViews(id, userType);

    console.log(`=== GET /profiles/${userType}/${id} - SUCCESS ===`);
    res.json({
      success: true,
      data: profile
    });

  } catch (error) {
    console.error(`=== GET /profiles/${userType}/${id} - ERROR ===`);
    console.error('Profile fetch error:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid profile ID'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: error.message
    });
  }
}));

// Get similar profiles
router.get('/similar', asyncHandler(async (req, res) => {
  console.log('=== GET /profiles/similar - START ===');
  console.log('Query parameters:', req.query);
  
  const {
    profileId,
    county,
    location,
    userType,
    limit = 10
  } = req.query;

  try {
    // Validate required parameters
    if (!profileId || !county || !userType) {
      console.log('Missing required parameters');
      return res.status(400).json({
        success: false,
        message: 'Profile ID, county, and user type are required'
      });
    }

    // Build filter for similar profiles
    const filter = {
      isActive: true,
      'currentPackage.status': 'active',
      _id: { $ne: profileId }, // Exclude the current profile
      'location.county': new RegExp(county, 'i')
    };

    console.log('Base similar profiles filter:', filter);

    // Add location filter if provided
    if (location && location !== 'null' && location !== 'undefined') {
      filter['location.location'] = new RegExp(location, 'i');
      console.log(`Added location filter: ${location}`);
    }

    // Get the model for the user type
    const Model = getModelByType(userType);
    
    if (!Model) {
      console.log(`Invalid userType: ${userType}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid user type'
      });
    }

    console.log(`Searching for similar ${userType} profiles in ${county}`);

    // Fetch similar profiles
    const similarProfiles = await Model.find(filter)
      .select('-password -email -paymentHistory -processedTransactions -emailVerificationCode -emailVerificationExpires')
      .sort({ 
        'currentPackage.packageType': -1, // Prioritize higher packages
        'analytics.views': -1, // Then by popularity
        createdAt: -1 // Then by newest
      })
      .limit(parseInt(limit))
      .lean();

    console.log(`Found ${similarProfiles.length} similar profiles`);

    // Add userType to each profile
    const profilesWithType = similarProfiles.map(profile => ({
      ...profile,
      userType: userType
    }));

    console.log('=== GET /profiles/similar - SUCCESS ===');
    res.json({
      success: true,
      data: {
        profiles: profilesWithType,
        count: profilesWithType.length
      }
    });

  } catch (error) {
    console.error('=== GET /profiles/similar - ERROR ===');
    console.error('Similar profiles fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch similar profiles',
      error: error.message
    });
  }
}));

// Helper function to increment profile views - FIXED VERSION
const incrementProfileViews = async (profileId, userType) => {
    try {
        const Model = getModelByType(userType);
        if (Model) {
            const result = await Model.findByIdAndUpdate(profileId, {
                $inc: { 'analytics.views': 1 },
                $set: { 'analytics.lastViewed': new Date() }
            }, { new: false }); // Don't return the updated document for performance
        } else {
            console.error(`No model found for userType: ${userType}`);
        }
    } catch (error) {
        console.error('Error incrementing profile views:', error);
    }
};

module.exports = router;