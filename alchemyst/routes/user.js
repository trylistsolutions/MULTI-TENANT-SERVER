const express = require('express');
const asyncHandler = require('express-async-handler');
const nodemailer = require('nodemailer');
const Escort = require('../models/Escort');
const Masseuse = require('../models/Masseuse');
const OFModel = require('../models/OFModel');
const Spa = require('../models/Spa');
const { authenticateToken } = require('../middleware/authMiddleware');
const multer = require('multer');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const verifyCronKey = require('../cron/cronAuth');
const bcrypt = require('bcryptjs');
const { getAlchemystDB } = require('../config/db');

const router = express.Router();

const startAlchemystSession = async () => getAlchemystDB().startSession();

// Configure multer storage (temporary)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Cloudinary Config
cloudinary.config({
  cloud_name: process.env.ALCHEMYST_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.ALCHEMYST_CLOUDINARY_API_KEY,
  api_secret: process.env.ALCHEMYST_CLOUDINARY_API_SECRET,
  secure: true
});

// Upload to Cloudinary function
const uploadToCloudinary = (fileBuffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: "alchemyst",
      resource_type: "image",
      quality: "auto:good",
      fetch_format: "auto",
      ...options
    };

    cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          reject({ message: "Image upload failed", error });
        } else {
          resolve(result);
        }
      }
    ).end(fileBuffer);
  });
};

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
      return null;
  }
};

// Create email transporter service
const transporter = nodemailer.createTransport({
  service: 'gmail',
  port: 465,
  secure: true,
  logger: true,
  debug: false,
  secureConnection: false,
  auth: {
    user: process.env.ALCHEMYST_EMAIL,
    pass: process.env.ALCHEMYST_EMAIL_PASSWORD,
  },
  tls: {
    rejectUnauthorized: true
  }
});

// Helper function to generate 4-digit random code
const generateRandomCode = () => {
  return Math.floor(1000 + Math.random() * 9000).toString(); // Generates a 4-digit code
};
















//1=================== GET ROUTES
// Get all users by userType
router.get('/type/:userType', asyncHandler(async (req, res) => {
  const { userType } = req.params;

  const Model = getModelByType(userType);
  if (!Model) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user type'
    });
  }

  const users = await Model.find().select('-password').limit(50); // Limit for safety

  res.json({
    success: true,
    data: users,
    count: users.length
  });
}));

// Get user by ID and type
router.get('/:type/:id', asyncHandler(async (req, res) => {
  const { type, id } = req.params;

  const Model = getModelByType(type);
  if (!Model) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user type'
    });
  }

  const user = await Model.findById(id).select('-password');


  if (!user) {
    return res.status(404).json({
      success: false,
      message: `${type.charAt(0).toUpperCase() + type.slice(1)} not found`
    });
  }

  res.json({
    success: true,
    data: {
      ...user.toObject(),
      userType: type
    }
  });
}));










//2=================== PROFILE ROUTES
/**Calculates if a user profile meets all requirements to be active */
const calculateIsActive = (user, userType) => {
  // Check email verification
  if (!user.verification?.isEmailVerified) {
    return false;
  }

  // Check active subscription
  if (!user.currentPackage || !user.currentPackage?.packageType || user.currentPackage?.status !== 'active') {
    return false;
  }

  // Check profile completeness based on user type
  if (userType === 'spa') {
    if (!user.username || !user.serviceType) {
      return false;
    }
  } else {
    // For escort, masseuse, of-model
    if (!user.gender || !user.sexualOrientation || !user.age || !user.nationality || !user.serviceType) {
      return false;
    }
  }

  // Check location information
  if (!user.location?.country || !user.location?.county || !user.location?.location || !user.location?.area) {
    return false;
  }

  // Check contact details
  if (!user.contact?.phoneNumber) {
    return false;
  }

  // Check profile image
  if (!user.profileImage) {
    return false;
  }

  // Check services
  if (!user.services || user.services.length === 0) {
    return false;
  }

  // All checks passed
  return true;
};

// Get current user profile (using auth middleware)
router.get('/profile', authenticateToken, asyncHandler(async (req, res) => {
  const { userType, user } = req;

  const Model = getModelByType(userType);
  if (!Model) {
    return res.status(400).json({ success: false, message: 'Invalid user type' });
  }

  // Define excluded fields in one place
  const SENSITIVE_FIELDS = '-password -emailVerificationCode -emailVerificationExpires';

  // Query fresh user with sensitive fields removed
  const safeUser = await Model.findById(user._id).select(SENSITIVE_FIELDS);

  if (!safeUser) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  // Calculate if user should be active based on profile completeness
  const shouldBeActive = calculateIsActive(safeUser, userType);

  // Update isActive if it has changed (avoid unnecessary DB writes)
  if (safeUser.isActive !== shouldBeActive && !safeUser.isDeactivated) {
    safeUser.isActive = shouldBeActive;
    await safeUser.save({ validateBeforeSave: false }); // Skip validation
  }

  // If user manually deactivated their account, keep it deactivated
  if (safeUser.isDeactivated) {
    safeUser.isActive = false;
    if (safeUser.isActive !== false) {
      await safeUser.save();
    }
  }

  res.json({
    success: true,
    data: safeUser
  });
}));

// Update personal information
router.put('/profile', authenticateToken, asyncHandler(async (req, res) => {
  const {
    username,
    gender,
    sexualOrientation,
    age,
    nationality,
    serviceType,
    bio, breastSize,
    bodyType,
    servesWho,
    ethnicity,
    providesEroticServices
  } = req.body;


  const user = req.user;
  const userType = req.userType;
  const Model = getModelByType(userType);

  if (!Model) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user type'
    });
  }

  if (!userType === 'spa') {
    if (!age) {
      return res.status(400).json({
        success: false,
        message: 'Please enter your age'
      });
    }
  }

  // Validate age if provided
  if (age && (age < 18 || age > 100)) {
    return res.status(400).json({
      success: false,
      message: 'Age must be between 18 and 100'
    });
  }

  try {
    // Build update object with only provided fields
    const updateData = {};

    if (username !== undefined) updateData.username = username.toLowerCase().trim();
    if (gender !== undefined) updateData.gender = gender;
    if (sexualOrientation !== undefined) updateData.sexualOrientation = sexualOrientation;
    if (age !== undefined) updateData.age = parseInt(age);
    if (nationality !== undefined) updateData.nationality = nationality.trim();
    if (serviceType !== undefined) updateData.serviceType = serviceType;
    if (bio !== undefined) updateData.bio = bio.trim();
    if (breastSize !== undefined) updateData.breastSize = breastSize;
    if (bodyType !== undefined) updateData.bodyType = bodyType;
    if (servesWho !== undefined) updateData.servesWho = servesWho;
    if (ethnicity !== undefined) updateData.ethnicity = ethnicity;
    if (providesEroticServices !== undefined) updateData.providesEroticServices = providesEroticServices;


    // Check if username is being changed and if it's already taken
    if (username && username !== user.username) {
      const existingUser = await Model.findOne({
        username: username.toLowerCase(),
        _id: { $ne: user._id }
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'Username already taken'
        });
      }
    }

    const updatedUser = await Model.findByIdAndUpdate(
      user._id,
      { $set: updateData },
      {
        new: true,
        runValidators: true
      }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Calculate if user should be active based on profile completeness
    const shouldBeActive = calculateIsActive(updatedUser, userType);

    // Update isActive if it has changed (avoid unnecessary DB writes)
    if (updatedUser.isActive !== shouldBeActive && !updatedUser.isDeactivated) {
      updatedUser.isActive = shouldBeActive;
      await updatedUser.save({ validateBeforeSave: false }); // Skip validation
    }

    // If user manually deactivated their account, keep it deactivated
    if (updatedUser.isDeactivated) {
      updatedUser.isActive = false;
      if (updatedUser.isActive !== false) {
        await updatedUser.save();
      }
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        gender: updatedUser.gender,
        sexualOrientation: updatedUser.sexualOrientation,
        age: updatedUser.age,
        nationality: updatedUser.nationality,
        serviceType: updatedUser.serviceType,
        bio: updatedUser.bio,
        breastSize: updatedUser.breastSize,
        bodyType: updatedUser.bodyType,
        servesWho: updatedUser.servesWho,
        ethnicity: updatedUser.ethnicity,
        userType: userType,
        isActive: updatedUser.isActive, // This will now reflect the calculated value
        providesEroticServices: updatedUser.providesEroticServices,
      }
    });

  } catch (error) {
    console.error('Profile update error:', error);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
}));


// Change Email Route
router.put('/change-email', authenticateToken, asyncHandler(async (req, res) => {
  console.log(`ROUTE HIT`)
  const { newEmail, password } = req.body;

  if (!newEmail || !password) {
    return res.status(400).json({
      success: false,
      message: 'New email and current password are required'
    });
  }

  // Validate email format
  const emailRegex = /\S+@\S+\.\S+/;
  if (!emailRegex.test(newEmail)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid email address'
    });
  }

  const user = req.user;
  const userType = req.userType;
  const Model = getModelByType(userType);

  if (!Model) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user type'
    });
  }

  try {
    // Find user with password for verification
    const userWithPassword = await Model.findById(user._id).select('+password');
    
    if (!userWithPassword) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(password, userWithPassword.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Check if new email is already taken
    const existingUser = await Model.findOne({
      email: newEmail.toLowerCase(),
      _id: { $ne: user._id }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email address is already in use'
      });
    }

    // Update email and reset email verification status
    const updatedUser = await Model.findByIdAndUpdate(
      user._id,
      {
        $set: {
          email: newEmail.toLowerCase().trim(),
          'verification.isEmailVerified': false,
          'emailVerificationCode': null,
          'emailVerificationExpires': null
        }
      },
      {
        new: true,
        runValidators: true
      }
    ).select('-password');

    res.json({
      success: true,
      message: 'Email changed successfully. Please check your new email for verification.',
      user: {
        id: updatedUser._id,
        email: updatedUser.email,
        username: updatedUser.username,
        userType: userType,
        verification: {
          isEmailVerified: updatedUser.verification.isEmailVerified
        }
      }
    });

  } catch (error) {
    console.error('Email change error:', error);

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to change email address'
    });
  }
}));

// Change Password Route
router.put('/change-password', authenticateToken, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Current password and new password are required'
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'New password must be at least 6 characters long'
    });
  }

  const user = req.user;
  const userType = req.userType;
  const Model = getModelByType(userType);

  if (!Model) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user type'
    });
  }

  try {
    // Find user with password
    const userWithPassword = await Model.findById(user._id).select('+password');
    
    if (!userWithPassword) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, userWithPassword.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Check if new password is same as current password
    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from current password'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await Model.findByIdAndUpdate(
      user._id,
      {
        $set: { password: hashedPassword }
      }
    );

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Password change error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
}));











//3=================== EMAIL VERIFICATION ROUTES
// Send verification code endpoint
router.post('/send-verification-code', authenticateToken, asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Email is required'
    });
  }

  // Generate 4-digit verification code
  const verificationCode = generateRandomCode();
  const expirationTime = Date.now() + 3600000; // 1 hour from now

  // Get the appropriate model
  const Model = getModelByType(req.userType);
  if (!Model) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user type'
    });
  }

  // Save verification code to user
  await Model.findByIdAndUpdate(req.user._id, {
    emailVerificationCode: verificationCode,
    emailVerificationExpires: expirationTime
  });

  // Send verification email with brand colors
  try {
    await transporter.sendMail({
      to: email,
      subject: 'Alchemyst - Your Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #ffffff; border: 3px solid #ff1493; border-radius: 15px; overflow: hidden;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #ff1493, #ff69b4); padding: 30px 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">ALCHEMYST</h1>
            <p style="color: white; margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Email Verification</p>
          </div>
          
          <!-- Content -->
          <div style="padding: 30px 25px;">
            <h2 style="color: #333; margin-bottom: 20px; text-align: center;">Your Verification Code</h2>
            
            <!-- Code Display - Very prominent -->
            <div style="background: #fff0f7; border: 4px dashed #ff1493; border-radius: 12px; padding: 25px; text-align: center; margin: 25px 0;">
              <div style="font-size: 42px; font-weight: bold; color: #ff1493; letter-spacing: 8px; text-shadow: 2px 2px 4px rgba(255, 20, 147, 0.2);">
                ${verificationCode}
              </div>
            </div>
            
            <p style="color: #666; text-align: center; margin-bottom: 15px; font-size: 14px;">
              Enter this code in the Alchemyst app to verify your email address.
            </p>
            
            <div style="background: #f8f8f8; border-radius: 8px; padding: 15px; margin: 20px 0;">
              <p style="color: #888; font-size: 12px; text-align: center; margin: 0;">
                <strong>Code expires in 1 hour</strong><br>
                If you didn't request this code, please ignore this email.
              </p>
            </div>
          </div>
          
          <!-- Footer -->
          <div style="background: #f8f8f8; padding: 20px; text-align: center; border-top: 1px solid #eee;">
            <p style="color: #999; margin: 0; font-size: 12px;">
              &copy; 2024 Alchemyst. All rights reserved.<br>
              Empowering connections in Kenya and beyond.
            </p>
          </div>
        </div>
      `
    });

    res.json({
      success: true,
      message: 'Verification code sent to your email'
    });
  } catch (error) {
    console.error('Error sending verification email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send verification code. Please try again.'
    });
  }
}));

// Verify email endpoint
router.post('/verify-email', authenticateToken, asyncHandler(async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({
      success: false,
      message: 'Verification code is required'
    });
  }

  const user = req.user;
  const userType = req.userType;
  const currentTime = Date.now();

  // Check if code matches and hasn't expired
  if (user.emailVerificationCode !== code || currentTime > user.emailVerificationExpires) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or expired verification code'
    });
  }

  // Get the appropriate model
  const Model = getModelByType(userType);
  if (!Model) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user type'
    });
  }

  // Update user email verification status
  const updateData = {
    emailVerificationCode: null,
    emailVerificationExpires: null
  };

  // Set verification status based on user type
  updateData['verification.isEmailVerified'] = true;

  await Model.findByIdAndUpdate(user._id, updateData);

  res.json({
    success: true,
    message: 'Email verified successfully',
    data: {
      emailVerified: true,
      isVerified: true
    }
  });
}));




//4=================== IMAGE UPLOAD ROUTES
// Upload image endpoint
router.post('/upload-image', authenticateToken, upload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No image file provided'
    });
  }

  const { type } = req.body; // 'profile' or 'secondary'
  const user = req.user;
  const userType = req.userType;
  const Model = getModelByType(userType);

  if (!Model) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user type'
    });
  }

  try {
    // Get username from authenticated user
    const username = user.email;

    // Set Cloudinary upload options based on image type
    const uploadOptions = {};

    if (type === 'profile') {
      if (userType === "spa") {
        uploadOptions.folder = `${userType}/${username}`;
      } else {
        uploadOptions.folder = `${userType}/${username}`;
        uploadOptions.width = 1080;
        uploadOptions.height = 1350;
        uploadOptions.crop = "fill";
      }
    } else {
      uploadOptions.folder = `${userType}/${username}`;
      uploadOptions.width = 1080;
      uploadOptions.height = 1350;
      uploadOptions.crop = "fill";
    }

    // Upload to Cloudinary
    const uploadResult = await uploadToCloudinary(req.file.buffer, uploadOptions);

    const imageData = {
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      width: uploadResult.width,
      height: uploadResult.height,
      format: uploadResult.format,
      bytes: uploadResult.bytes,
      createdAt: uploadResult.created_at
    };

    // Update user in database based on image type
    let updateData = {};

    if (type === 'profile') {
      // First, delete old profile image if exists
      if (user.profileImage && user.profileImage.profilePicPublicId) {
        try {
          await cloudinary.uploader.destroy(user.profileImage.profilePicPublicId);
        } catch (deleteError) {
          console.error('Error deleting old profile image:', deleteError);
          // Continue with upload even if deletion fails
        }
      }

      updateData = {
        profileImage: {
          url: imageData.url,
          profilePicPublicId: imageData.publicId
        }
      };
    } else {
      // For secondary images, add to array
      updateData = {
        $push: {
          secondaryImages: imageData
        }
      };
    }

    // Update user document
    const updatedUser = await Model.findByIdAndUpdate(
      user._id,
      updateData,
      { new: true }
    ).select('-password');

    // Calculate if user should be active based on profile completeness
    const shouldBeActive = calculateIsActive(updatedUser, userType);

    // Update isActive if it has changed (avoid unnecessary DB writes)
    if (updatedUser.isActive !== shouldBeActive && !updatedUser.isDeactivated) {
      updatedUser.isActive = shouldBeActive;
      await updatedUser.save({ validateBeforeSave: false }); // Skip validation
    }

    // If user manually deactivated their account, keep it deactivated
    if (updatedUser.isDeactivated) {
      updatedUser.isActive = false;
      if (updatedUser.isActive !== false) {
        await updatedUser.save();
      }
    }

    res.json({
      success: true,
      message: 'Image uploaded successfully',
      data: type === 'profile' ? updatedUser.profileImage : imageData
    });

  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload image'
    });
  }
}));

// Delete image endpoint
router.delete('/delete-image', authenticateToken, asyncHandler(async (req, res) => {
  const { publicId, type } = req.body;

  if (!publicId || !type) {
    return res.status(400).json({
      success: false,
      message: 'Public ID and image type are required'
    });
  }

  const user = req.user;
  const userType = req.userType;
  const Model = getModelByType(userType);

  if (!Model) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user type'
    });
  }

  try {
    // Delete from Cloudinary
    const deleteResult = await cloudinary.uploader.destroy(publicId);

    if (deleteResult.result !== 'ok') {
      return res.status(400).json({
        success: false,
        message: 'Failed to delete image from storage'
      });
    }

    // Update user document based on image type
    let updateData = {};

    if (type === 'profile') {
      updateData = {
        $unset: { profileImage: 1 }
      };
    } else {
      // Remove from secondaryImages array
      updateData = {
        $pull: {
          secondaryImages: { publicId: publicId }
        }
      };
    }

    await Model.findByIdAndUpdate(user._id, updateData);

    res.json({
      success: true,
      message: 'Image deleted successfully',
      data: { publicId }
    });

  } catch (error) {
    console.error('Image deletion error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete image'
    });
  }
}));

// Get user images endpoint
router.get('/images', authenticateToken, asyncHandler(async (req, res) => {
  const user = req.user;
  const userType = req.userType;
  const Model = getModelByType(userType);

  if (!Model) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user type'
    });
  }

  const userData = await Model.findById(user._id).select('profileImage secondaryImages');

  res.json({
    success: true,
    data: {
      profileImage: userData.profileImage || null,
      secondaryImages: userData.secondaryImages || []
    }
  });
}));




//5=================== SUBSCRIPTION & PAYMENT ROUTES
// Package priority for upgrades
const PACKAGE_PRIORITY = {
  'basic': 1,
  'premium': 2,
  'elite': 3
};

// Calculate package price
const calculatePrice = (weeklyPrice, durationType) => {
  if (durationType === 'weekly') {
    return weeklyPrice;
  }
  // 12.5% discount for monthly
  return Math.round(weeklyPrice * 4 * 0.875);
};

// Subscribe to package (NEW subscription only)
router.post('/subscribe', authenticateToken, asyncHandler(async (req, res) => {
  const { packageType, durationType, totalCost, weeklyPrice } = req.body;

  if (!packageType || !durationType || !totalCost) {
    return res.status(400).json({
      success: false,
      message: 'All subscription fields are required'
    });
  }

  const user = req.user;
  const userType = req.userType;
  const Model = getModelByType(userType);

  if (!Model) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user type'
    });
  }

  // Check if user already has an active package
  if (user.currentPackage?.status === 'active' &&
    new Date(user.currentPackage.expiryDate) > new Date()) {
    return res.status(400).json({
      success: false,
      message: 'You already have an active package. Please upgrade or wait for expiry.'
    });
  }

  // Check wallet balance
  if (user.wallet.balance < totalCost) {
    return res.status(400).json({
      success: false,
      message: 'Insufficient wallet balance'
    });
  }

  const session = await startAlchemystSession();
  session.startTransaction();

  try {
    const purchaseDate = new Date();
    const daysToAdd = durationType === 'weekly' ? 7 : 30;
    const expiryDate = new Date(purchaseDate);
    expiryDate.setDate(expiryDate.getDate() + daysToAdd);

    const newPackage = {
      packageType,
      durationType,
      totalCost,
      purchaseDate,
      expiryDate,
      status: 'active',
      autoRenew: false,
      autoRenewDurationType: null
    };

    const updatedUser = await Model.findByIdAndUpdate(
      user._id,
      {
        $set: {
          currentPackage: newPackage,
          'wallet.balance': user.wallet.balance - totalCost
        },
        $push: {
          packageHistory: {
            ...newPackage,
            action: 'subscribe',
            timestamp: new Date()
          },
          paymentHistory: {
            transactionId: `SUB_${Date.now()}`,
            amount: -totalCost,
            type: 'subscription',
            status: 'completed',
            description: `New Subscription: ${packageType} ${durationType}`,
            timestamp: new Date()
          }
        }
      },
      { new: true, session }
    ).select('-password');

    // Calculate if user should be active based on profile completeness
    const shouldBeActive = calculateIsActive(updatedUser, userType);

    // Update isActive if it has changed (avoid unnecessary DB writes)
    if (updatedUser.isActive !== shouldBeActive && !updatedUser.isDeactivated) {
      updatedUser.isActive = shouldBeActive;
      await updatedUser.save({ validateBeforeSave: false }); // Skip validation
    }

    // If user manually deactivated their account, keep it deactivated
    if (updatedUser.isDeactivated) {
      updatedUser.isActive = false;
      if (updatedUser.isActive !== false) {
        await updatedUser.save();
      }
    }

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: 'Subscription successful',
      data: {
        currentPackage: updatedUser.currentPackage,
        newBalance: updatedUser.wallet.balance
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
}));

// Upgrade package (mid-subscription upgrade)
router.post('/upgrade', authenticateToken, asyncHandler(async (req, res) => {
  const { packageType, durationType, totalCost } = req.body;

  const user = req.user;
  const userType = req.userType;
  const Model = getModelByType(userType);

  // Check if user has active package
  if (!user.currentPackage || user.currentPackage.status !== 'active' ||
    new Date(user.currentPackage.expiryDate) <= new Date()) {
    return res.status(400).json({
      success: false,
      message: 'No active package to upgrade from'
    });
  }

  // Validate upgrade (must be to higher tier)
  const currentPriority = PACKAGE_PRIORITY[user.currentPackage.packageType];
  const newPriority = PACKAGE_PRIORITY[packageType];

  if (newPriority <= currentPriority) {
    return res.status(400).json({
      success: false,
      message: 'You can only upgrade to a higher tier package'
    });
  }

  // Check wallet balance
  if (user.wallet.balance < totalCost) {
    return res.status(400).json({
      success: false,
      message: 'Insufficient wallet balance'
    });
  }

  const session = await startAlchemystSession();
  session.startTransaction();

  try {
    const purchaseDate = new Date();
    const daysToAdd = durationType === 'weekly' ? 7 : 30;
    const expiryDate = new Date(purchaseDate);
    expiryDate.setDate(expiryDate.getDate() + daysToAdd);

    const upgradedPackage = {
      packageType,
      durationType,
      totalCost,
      purchaseDate,
      expiryDate,
      status: 'active',
      autoRenew: user.currentPackage.autoRenew, // Preserve auto-renew setting
      autoRenewDurationType: user.currentPackage.autoRenew ? durationType : null
    };

    const updatedUser = await Model.findByIdAndUpdate(
      user._id,
      {
        $set: {
          currentPackage: upgradedPackage,
          'wallet.balance': user.wallet.balance - totalCost
        },
        $push: {
          packageHistory: {
            ...upgradedPackage,
            action: 'upgrade',
            timestamp: new Date()
          },
          paymentHistory: {
            transactionId: `UPGRADE_${Date.now()}`,
            amount: -totalCost,
            type: 'subscription',
            status: 'completed',
            description: `Upgrade to: ${packageType} ${durationType}`,
            timestamp: new Date()
          }
        }
      },
      { new: true, session }
    ).select('-password');

    // Calculate if user should be active based on profile completeness
    const shouldBeActive = calculateIsActive(updatedUser, userType);

    // Update isActive if it has changed (avoid unnecessary DB writes)
    if (updatedUser.isActive !== shouldBeActive && !updatedUser.isDeactivated) {
      updatedUser.isActive = shouldBeActive;
      await updatedUser.save({ validateBeforeSave: false }); // Skip validation
    }

    // If user manually deactivated their account, keep it deactivated
    if (updatedUser.isDeactivated) {
      updatedUser.isActive = false;
      if (updatedUser.isActive !== false) {
        await updatedUser.save();
      }
    }

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: 'Package upgraded successfully',
      data: {
        currentPackage: updatedUser.currentPackage,
        newBalance: updatedUser.wallet.balance
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
}));

// Renew package (manual renewal)
router.post('/renew', authenticateToken, asyncHandler(async (req, res) => {
  const { durationType, totalCost } = req.body;

  const user = req.user;
  const userType = req.userType;
  const Model = getModelByType(userType);

  if (!user.currentPackage) {
    return res.status(400).json({
      success: false,
      message: 'No package to renew'
    });
  }

  // Check wallet balance
  if (user.wallet.balance < totalCost) {
    return res.status(400).json({
      success: false,
      message: 'Insufficient wallet balance'
    });
  }

  const session = await startAlchemystSession();
  session.startTransaction();

  try {
    const daysToAdd = durationType === 'weekly' ? 7 : 30;

    // If package is still active, extend from current expiry
    // If expired, start from now
    let newExpiryDate;
    if (user.currentPackage.status === 'active' &&
      new Date(user.currentPackage.expiryDate) > new Date()) {
      newExpiryDate = new Date(user.currentPackage.expiryDate);
    } else {
      newExpiryDate = new Date();
    }
    newExpiryDate.setDate(newExpiryDate.getDate() + daysToAdd);

    const renewedPackage = {
      ...user.currentPackage.toObject(),
      durationType,
      totalCost: totalCost,
      expiryDate: newExpiryDate,
      status: 'active'
    };

    const updatedUser = await Model.findByIdAndUpdate(
      user._id,
      {
        $set: {
          currentPackage: renewedPackage,
          'wallet.balance': user.wallet.balance - totalCost
        },
        $push: {
          packageHistory: {
            packageType: renewedPackage.packageType,
            durationType,
            totalCost,
            purchaseDate: new Date(),
            expiryDate: newExpiryDate,
            action: 'renew',
            timestamp: new Date()
          },
          paymentHistory: {
            transactionId: `RENEW_${Date.now()}`,
            amount: -totalCost,
            type: 'subscription',
            status: 'completed',
            description: `Renewal: ${renewedPackage.packageType} ${durationType}`,
            timestamp: new Date()
          }
        }
      },
      { new: true, session }
    ).select('-password');

    // Calculate if user should be active based on profile completeness
    const shouldBeActive = calculateIsActive(updatedUser, userType);

    // Update isActive if it has changed (avoid unnecessary DB writes)
    if (updatedUser.isActive !== shouldBeActive && !updatedUser.isDeactivated) {
      updatedUser.isActive = shouldBeActive;
      await updatedUser.save({ validateBeforeSave: false }); // Skip validation
    }

    // If user manually deactivated their account, keep it deactivated
    if (updatedUser.isDeactivated) {
      updatedUser.isActive = false;
      if (updatedUser.isActive !== false) {
        await updatedUser.save();
      }
    }

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: 'Package renewed successfully',
      data: {
        currentPackage: updatedUser.currentPackage,
        newBalance: updatedUser.wallet.balance
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
}));

// Toggle auto-renew
router.post('/auto-renew', authenticateToken, asyncHandler(async (req, res) => {
  const { enabled, durationType } = req.body;

  const user = req.user;
  const userType = req.userType;
  const Model = getModelByType(userType);

  if (!user.currentPackage || user.currentPackage.status !== 'active') {
    return res.status(400).json({
      success: false,
      message: 'No active package found'
    });
  }

  const updatedUser = await Model.findByIdAndUpdate(
    user._id,
    {
      $set: {
        'currentPackage.autoRenew': enabled,
        'currentPackage.autoRenewDurationType': enabled ? durationType : null
      }
    },
    { new: true }
  ).select('-password');

  // Calculate if user should be active based on profile completeness
  const shouldBeActive = calculateIsActive(updatedUser, userType);

  // Update isActive if it has changed (avoid unnecessary DB writes)
  if (updatedUser.isActive !== shouldBeActive && !updatedUser.isDeactivated) {
    updatedUser.isActive = shouldBeActive;
    await updatedUser.save({ validateBeforeSave: false }); // Skip validation
  }

  // If user manually deactivated their account, keep it deactivated
  if (updatedUser.isDeactivated) {
    updatedUser.isActive = false;
    if (updatedUser.isActive !== false) {
      await updatedUser.save();
    }
  }

  res.json({
    success: true,
    message: `Auto-renew ${enabled ? 'enabled' : 'disabled'}`,
    data: {
      currentPackage: updatedUser.currentPackage
    }
  });
}));

// Cancel package (sets to expire at end of current period)
router.post('/cancel', authenticateToken, asyncHandler(async (req, res) => {
  const user = req.user;
  const userType = req.userType;
  const Model = getModelByType(userType);

  if (!user.currentPackage || user.currentPackage.status !== 'active') {
    return res.status(400).json({
      success: false,
      message: 'No active package to cancel'
    });
  }

  const updatedUser = await Model.findByIdAndUpdate(
    user._id,
    {
      $set: {
        'currentPackage.autoRenew': false,
        'currentPackage.autoRenewDurationType': null,
        'currentPackage.status': 'cancelled'
      },
    },
    { new: true }
  ).select('-password');

  // Calculate if user should be active based on profile completeness
  const shouldBeActive = calculateIsActive(updatedUser, userType);

  // Update isActive if it has changed (avoid unnecessary DB writes)
  if (updatedUser.isActive !== shouldBeActive && !updatedUser.isDeactivated) {
    updatedUser.isActive = shouldBeActive;
    await updatedUser.save({ validateBeforeSave: false }); // Skip validation
  }

  // If user manually deactivated their account, keep it deactivated
  if (updatedUser.isDeactivated) {
    updatedUser.isActive = false;
    if (updatedUser.isActive !== false) {
      await updatedUser.save();
    }
  }

  res.json({
    success: true,
    message: 'Package cancelled. It will expire at the end of current period.',
    data: {
      currentPackage: updatedUser.currentPackage
    }
  });
}));

// Cron job function to expire packages (call this daily)
router.post('/check-expirations', verifyCronKey, asyncHandler(async (req, res) => {
  const models = [Escort, Masseuse, OFModel, Spa];
  let expiredCount = 0;
  let autoRenewedCount = 0;

  for (const Model of models) {
    // Find all users with active packages that have expired
    const usersToExpire = await Model.find(
      {
        'currentPackage.expiryDate': { $lte: new Date() }
      },
      { _id: 1, wallet: 1, currentPackage: 1 } // only fields used
    );


    for (const user of usersToExpire) {
      const session = await startAlchemystSession();
      session.startTransaction();

      try {
        // Check if auto-renew is enabled and user has sufficient balance
        if (user.currentPackage.autoRenew && user.currentPackage.autoRenewDurationType) {
          const durationType = user.currentPackage.autoRenewDurationType;
          const weeklyPrice = user.currentPackage.totalCost /
            (user.currentPackage.durationType === 'weekly' ? 1 : 4);
          const renewalCost = calculatePrice(weeklyPrice, durationType);

          if (user.wallet.balance >= renewalCost) {
            // Auto-renew the package
            const daysToAdd = durationType === 'weekly' ? 7 : 30;
            const newExpiryDate = new Date();
            newExpiryDate.setDate(newExpiryDate.getDate() + daysToAdd); ``

            await Model.findByIdAndUpdate(
              user._id,
              {
                $set: {
                  'currentPackage.expiryDate': newExpiryDate,
                  'currentPackage.durationType': durationType,
                  'currentPackage.totalCost': renewalCost,
                  'currentPackage.status': 'active',
                  'wallet.balance': user.wallet.balance - renewalCost
                },
                $push: {
                  packageHistory: {
                    packageType: user.currentPackage.packageType,
                    durationType,
                    totalCost: renewalCost,
                    purchaseDate: new Date(),
                    expiryDate: newExpiryDate,
                    action: 'auto-renew',
                    timestamp: new Date()
                  },
                  paymentHistory: {
                    transactionId: `AUTO_RENEW_${Date.now()}`,
                    amount: -renewalCost,
                    type: 'subscription',
                    status: 'completed',
                    description: `Auto-renewal: ${user.currentPackage.packageType} ${durationType}`,
                    timestamp: new Date()
                  }
                }
              },
              { session }
            );

            autoRenewedCount++;
            await session.commitTransaction();
            continue;
          }
        }

        // Expire the package
        await Model.findByIdAndUpdate(
          user._id,
          {
            $set: {
              'currentPackage.status': 'expired',
            },
          },
          { session }
        );

        expiredCount++;
        await session.commitTransaction();

      } catch (error) {
        await session.abortTransaction();
        console.error('Error processing expiration:', error);
      } finally {
        session.endSession();
      }
    }
  }

  res.json({
    success: true,
    message: `Processed expirations: ${expiredCount} expired, ${autoRenewedCount} auto-renewed`
  });
}));







//6=============== LOCATION ROUTES
// Update location information
router.put('/location', authenticateToken, asyncHandler(async (req, res) => {
  const { country, county, location, area } = req.body;

  const user = req.user;
  const userType = req.userType;
  const Model = getModelByType(userType);

  if (!Model) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user type'
    });
  }

  // Validate required fields
  if (!country || !county || !location || !area || !Array.isArray(area) || area.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Country, county, location, and at least one area are required'
    });
  }

  try {
    // Build location update object
    const updateData = {
      'location.country': country.trim(),
      'location.county': county.trim(),
      'location.location': location.trim(),
      'location.area': area.map(a => a.trim()).filter(a => a.length > 0)
    };

    const updatedUser = await Model.findByIdAndUpdate(
      user._id,
      { $set: updateData },
      {
        new: true,
        runValidators: true
      }
    ).select('-password');

    // Calculate if user should be active based on profile completeness
    const shouldBeActive = calculateIsActive(updatedUser, userType);

    // Update isActive if it has changed (avoid unnecessary DB writes)
    if (updatedUser.isActive !== shouldBeActive && !updatedUser.isDeactivated) {
      updatedUser.isActive = shouldBeActive;
      await updatedUser.save({ validateBeforeSave: false }); // Skip validation
    }

    // If user manually deactivated their account, keep it deactivated
    if (updatedUser.isDeactivated) {
      updatedUser.isActive = false;
      if (updatedUser.isActive !== false) {
        await updatedUser.save();
      }
    }

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prepare response data
    const responseData = {
      location: {
        country: updatedUser.location?.country,
        county: updatedUser.location?.county,
        location: updatedUser.location?.location,
        area: updatedUser.location?.area || [],
      }
    };

    res.json({
      success: true,
      message: 'Location updated successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Location update error:', error);

    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update location'
    });
  }
}));










//7=================== CONTACT DETAILS
// Update contact information
router.put('/contact', authenticateToken, asyncHandler(async (req, res) => {
  const { phoneNumber, secondaryPhone, hasWhatsApp, prefersCall, telegramLink, onlyFansLink } = req.body;

  const user = req.user;
  const userType = req.userType;
  const Model = getModelByType(userType);

  if (!Model) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user type'
    });
  }

  // Validate required fields
  if (!phoneNumber || !phoneNumber.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Phone number is required'
    });
  }

  // Validate phone number format (Kenyan format)
  const phoneRegex = /^(?:254|\+254|0)?(7\d{8}|1\d{8})$/;
  const cleanedPhone = phoneNumber.trim().replace(/\s+/g, '');

  if (!phoneRegex.test(cleanedPhone)) {
    return res.status(400).json({
      success: false,
      message: 'Please enter a valid Kenyan phone number'
    });
  }


  // Format phone number to standard format (2547XXXXXXXX)
  const formattedPhone = cleanedPhone.replace(phoneRegex, '254$1');

  try {
    // Check if phone number is already used by another user
    const existingUser = await Model.findOne({
      'contact.phoneNumber': formattedPhone,
      _id: { $ne: user._id }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Phone number is already registered by another user'
      });
    }

    // Build contact update object
    const updateData = {
      'contact.phoneNumber': formattedPhone,
      'contact.hasWhatsApp': Boolean(hasWhatsApp),
      'contact.prefersCall': Boolean(prefersCall),
      'contact.lastUpdated': new Date()
    };

    // Only add telegramLink if provided
    if (telegramLink && telegramLink.trim()) {
      // Validate Telegram link format
      const telegramRegex = /^https?:\/\/(t\.me|telegram\.me)\/.+/;
      if (!telegramRegex.test(telegramLink.trim())) {
        return res.status(400).json({
          success: false,
          message: 'Please enter a valid Telegram link (https://t.me/username)'
        });
      }
      updateData['contact.telegramLink'] = telegramLink.trim();
    } else {
      updateData['contact.telegramLink'] = null;
    }

    // Only add onlyFansLink for OF models and if provided
    if (userType === 'of-model' && onlyFansLink && onlyFansLink.trim()) {
      // Validate OnlyFans link format
      const onlyFansRegex = /^https?:\/\/(onlyfans\.com)\/.+/;
      if (!onlyFansRegex.test(onlyFansLink.trim())) {
        return res.status(400).json({
          success: false,
          message: 'Please enter a valid OnlyFans link (https://onlyfans.com/username)'
        });
      }
      updateData['contact.onlyFansLink'] = onlyFansLink.trim();
    } else if (userType !== 'of-model') {
      updateData['contact.onlyFansLink'] = null;
    }

    // Handle secondary phone (only for spas)
    if (userType === "spa" && secondaryPhone && secondaryPhone.trim()) {
      const cleanedSecondary = secondaryPhone.trim().replace(/\s+/g, '');
      if (!phoneRegex.test(cleanedSecondary)) {
        return res.status(400).json({
          success: false,
          message: 'Please enter a valid secondary phone number'
        });
      }
      const formattedSecondary = cleanedSecondary.replace(phoneRegex, '254$1');
      updateData['contact.secondaryPhone'] = formattedSecondary;
    } else if (userType === "spa") {
      updateData['contact.secondaryPhone'] = null;
    }


    const updatedUser = await Model.findByIdAndUpdate(
      user._id,
      { $set: updateData },
      {
        new: true,
        runValidators: true
      }
    ).select('-password');

    // Calculate if user should be active based on profile completeness
    const shouldBeActive = calculateIsActive(updatedUser, userType);

    // Update isActive if it has changed (avoid unnecessary DB writes)
    if (updatedUser.isActive !== shouldBeActive && !updatedUser.isDeactivated) {
      updatedUser.isActive = shouldBeActive;
      await updatedUser.save({ validateBeforeSave: false }); // Skip validation
    }

    // If user manually deactivated their account, keep it deactivated
    if (updatedUser.isDeactivated) {
      updatedUser.isActive = false;
      if (updatedUser.isActive !== false) {
        await updatedUser.save();
      }
    }

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prepare response data
    const responseData = {
      id: updatedUser._id,
      username: updatedUser.username,
      email: updatedUser.email,
      userType: userType,
      phoneNumber: updatedUser.contact?.phoneNumber,
      hasWhatsApp: updatedUser.contact?.hasWhatsApp || false,
      prefersCall: updatedUser.contact?.prefersCall || false,
      telegramLink: updatedUser.contact?.telegramLink || '',
      onlyFansLink: updatedUser.contact?.onlyFansLink || '',
      isPhoneVerified: updatedUser.contact?.isPhoneVerified || false,
      secondaryPhone: updatedUser.contact?.secondaryPhone || '',
      // Include other fields that might be needed by frontend
      ...(updatedUser.profileImage && { profileImage: updatedUser.profileImage }),
      ...(updatedUser.wallet && { wallet: updatedUser.wallet }),
      ...(updatedUser.purchasedPackages && { purchasedPackages: updatedUser.purchasedPackages })
    };

    res.json({
      success: true,
      message: 'Contact details updated successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Contact update error:', error);

    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update contact details'
    });
  }
}));








//8=================== SERVICES
// Add batch services
router.post('/services/batch', authenticateToken, upload.any(), asyncHandler(async (req, res) => {
  const user = req.user;
  const userType = req.userType;
  const Model = getModelByType(userType);

  if (!Model) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user type'
    });
  }

  try {
    // Parse services from form data
    let services;
    try {
      services = JSON.parse(req.body.services);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid services data format'
      });
    }

    if (!Array.isArray(services) || services.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Services array is required and cannot be empty'
      });
    }

    const session = await startAlchemystSession();
    session.startTransaction();

    try {
      const newServices = [];
      const username = user.username;

      // Process each service
      for (const service of services) {
        if (!service.name || !service.name.trim()) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: 'Service name is required for all services'
          });
        }

        // Set default to contact for price if no price provided
        const contactForPrice = service.contactForPrice || !service.price;

        const serviceData = {
          name: service.name.trim(),
          description: service.description?.trim() || '',
          price: service.price || 0,
          pricingUnit: service.pricingUnit || 'Per Hour',
          contactForPrice: contactForPrice,
          priceNegotiable: Boolean(service.priceNegotiable),
          isActive: Boolean(service.isActive),
          createdAt: new Date(),
          updatedAt: new Date()
        };

        // Handle service image for SPAs
        if (userType === 'spa') {
          const imageFieldName = `image_${service.name}`;
          const imageFile = req.files?.find(file => file.fieldname === imageFieldName);

          if (imageFile) {
            try {
              const uploadOptions = {
                folder: `${userType}/${username}/services`,
                width: 800,
                height: 600,
                crop: "fill",
                quality: "auto:good",
                fetch_format: "auto"
              };

              const uploadResult = await uploadToCloudinary(imageFile.buffer, uploadOptions);

              serviceData.image = {
                url: uploadResult.secure_url,
                publicId: uploadResult.public_id,
                width: uploadResult.width,
                height: uploadResult.height,
                format: uploadResult.format,
                bytes: uploadResult.bytes,
                createdAt: uploadResult.created_at
              };
            } catch (uploadError) {
              console.error(`Image upload failed for service ${service.name}:`, uploadError);
              // Continue without image if upload fails
            }
          }
        }

        newServices.push(serviceData);
      }

      // Add all services to user
      const updatedUser = await Model.findByIdAndUpdate(
        user._id,
        {
          $push: { services: { $each: newServices } }
        },
        { new: true, session }
      ).select('-password');

      await session.commitTransaction();
      session.endSession();

      // Calculate if user should be active based on profile completeness
      const shouldBeActive = calculateIsActive(updatedUser, userType);

      // Update isActive if it has changed (avoid unnecessary DB writes)
      if (updatedUser.isActive !== shouldBeActive && !updatedUser.isDeactivated) {
        updatedUser.isActive = shouldBeActive;
        await updatedUser.save({ validateBeforeSave: false }); // Skip validation
      }

      // If user manually deactivated their account, keep it deactivated
      if (updatedUser.isDeactivated) {
        updatedUser.isActive = false;
        if (updatedUser.isActive !== false) {
          await updatedUser.save();
        }
      }

      // Get the newly added services (last n services)
      const addedServices = updatedUser.services.slice(-newServices.length);

      res.json({
        success: true,
        message: `${newServices.length} service(s) added successfully`,
        data: addedServices
      });

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }

  } catch (error) {
    console.error('Batch services error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add services'
    });
  }
}));

// Update a service
router.put('/services/:serviceId', authenticateToken, upload.single('image'), asyncHandler(async (req, res) => {
  const { serviceId } = req.params;
  const { name, description, price, pricingUnit, contactForPrice, isActive, priceNegotiable } = req.body;

  const user = req.user;
  const userType = req.userType;
  const Model = getModelByType(userType);

  if (!Model) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user type'
    });
  }

  // Validate service ID
  if (!mongoose.Types.ObjectId.isValid(serviceId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid service ID'
    });
  }

  try {
    // Find the user and the specific service
    const currentUser = await Model.findById(user._id);
    const service = currentUser.services.id(serviceId);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Set default to contact for price if no price provided
    const finalContactForPrice = contactForPrice === 'true' || (!price && !contactForPrice);

    // Build update object
    const updateFields = {};
    if (name !== undefined) updateFields['services.$.name'] = name.trim();
    if (description !== undefined) updateFields['services.$.description'] = description.trim();
    if (price !== undefined) updateFields['services.$.price'] = parseFloat(price) || 0;
    if (pricingUnit !== undefined) updateFields['services.$.pricingUnit'] = pricingUnit;
    if (isActive !== undefined) updateFields['services.$.isActive'] = isActive === 'true';
    if (priceNegotiable !== undefined) updateFields['services.$.priceNegotiable'] = priceNegotiable === 'true';
    updateFields['services.$.contactForPrice'] = finalContactForPrice;
    updateFields['services.$.updatedAt'] = new Date();

    // Handle image upload for SPAs
    if (userType === 'spa' && req.file) {
      const username = user.username;

      try {
        // Delete old image if exists
        if (service.image && service.image.publicId) {
          try {
            await cloudinary.uploader.destroy(service.image.publicId);
          } catch (deleteError) {
            console.error('Error deleting old service image:', deleteError);
          }
        }

        const uploadOptions = {
          folder: `${userType}/${username}/services`,
          width: 800,
          height: 600,
          crop: "fill",
          quality: "auto:good",
          fetch_format: "auto"
        };

        const uploadResult = await uploadToCloudinary(req.file.buffer, uploadOptions);

        updateFields['services.$.image'] = {
          url: uploadResult.secure_url,
          publicId: uploadResult.public_id,
          width: uploadResult.width,
          height: uploadResult.height,
          format: uploadResult.format,
          bytes: uploadResult.bytes,
          createdAt: uploadResult.created_at
        };
      } catch (uploadError) {
        console.error('Service image upload error:', uploadError);
        return res.status(500).json({
          success: false,
          message: 'Failed to upload service image'
        });
      }
    }

    const updatedUser = await Model.findOneAndUpdate(
      { _id: user._id, 'services._id': serviceId },
      { $set: updateFields },
      { new: true }
    ).select('-password');

    const updatedService = updatedUser.services.id(serviceId);

    // Calculate if user should be active based on profile completeness
    const shouldBeActive = calculateIsActive(updatedUser, userType);

    // Update isActive if it has changed (avoid unnecessary DB writes)
    if (updatedUser.isActive !== shouldBeActive && !updatedUser.isDeactivated) {
      updatedUser.isActive = shouldBeActive;
      await updatedUser.save({ validateBeforeSave: false }); // Skip validation
    }

    // If user manually deactivated their account, keep it deactivated
    if (updatedUser.isDeactivated) {
      updatedUser.isActive = false;
      if (updatedUser.isActive !== false) {
        await updatedUser.save();
      }
    }

    res.json({
      success: true,
      message: 'Service updated successfully',
      data: updatedService
    });

  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update service'
    });
  }
}));

// Delete a service
router.delete('/services/:serviceId', authenticateToken, asyncHandler(async (req, res) => {
  const { serviceId } = req.params;

  const user = req.user;
  const userType = req.userType;
  const Model = getModelByType(userType);

  if (!Model) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user type'
    });
  }

  // Validate service ID
  if (!mongoose.Types.ObjectId.isValid(serviceId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid service ID'
    });
  }

  try {
    // Find the user and the specific service to get image publicId
    const currentUser = await Model.findById(user._id);
    const service = currentUser.services.id(serviceId);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Delete service image from Cloudinary if exists (for SPAs)
    if (userType === 'spa' && service.image && service.image.publicId) {
      try {
        await cloudinary.uploader.destroy(service.image.publicId);
      } catch (deleteError) {
        console.error('Error deleting service image from Cloudinary:', deleteError);
        // Continue with service deletion even if image deletion fails
      }
    }

    // Remove the service from the array
    const updatedUser = await Model.findByIdAndUpdate(
      user._id,
      { $pull: { services: { _id: serviceId } } },
      { new: true }
    ).select('-password');

    // Calculate if user should be active based on profile completeness
    const shouldBeActive = calculateIsActive(updatedUser, userType);

    // Update isActive if it has changed (avoid unnecessary DB writes)
    if (updatedUser.isActive !== shouldBeActive && !updatedUser.isDeactivated) {
      updatedUser.isActive = shouldBeActive;
      await updatedUser.save({ validateBeforeSave: false }); // Skip validation
    }

    // If user manually deactivated their account, keep it deactivated
    if (updatedUser.isDeactivated) {
      updatedUser.isActive = false;
      if (updatedUser.isActive !== false) {
        await updatedUser.save();
      }
    }

    res.json({
      success: true,
      message: 'Service deleted successfully',
      data: {
        deletedServiceId: serviceId
      }
    });

  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete service'
    });
  }
}));

// Get all services for user
router.get('/services', authenticateToken, asyncHandler(async (req, res) => {
  const user = req.user;
  const userType = req.userType;
  const Model = getModelByType(userType);

  if (!Model) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user type'
    });
  }

  const userData = await Model.findById(user._id).select('services');

  res.json({
    success: true,
    data: userData.services || []
  });
}));

// Toggle service status
router.patch('/services/:serviceId/status', authenticateToken, asyncHandler(async (req, res) => {
  const { serviceId } = req.params;
  const { isActive } = req.body;


  const user = req.user;
  const userType = req.userType;
  const Model = getModelByType(userType);

  if (!Model) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user type'
    });
  }

  // Validate service ID
  if (!mongoose.Types.ObjectId.isValid(serviceId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid service ID'
    });
  }

  try {
    const updatedUser = await Model.findOneAndUpdate(
      { _id: user._id, 'services._id': serviceId },
      {
        $set: {
          'services.$.isActive': Boolean(isActive),
          'services.$.updatedAt': new Date()
        }
      },
      { new: true }
    ).select('-password');

    // Calculate if user should be active based on profile completeness
    const shouldBeActive = calculateIsActive(updatedUser, userType);

    // Update isActive if it has changed (avoid unnecessary DB writes)
    if (updatedUser.isActive !== shouldBeActive && !updatedUser.isDeactivated) {
      updatedUser.isActive = shouldBeActive;
      await updatedUser.save({ validateBeforeSave: false }); // Skip validation
    }

    // If user manually deactivated their account, keep it deactivated
    if (updatedUser.isDeactivated) {
      updatedUser.isActive = false;
      if (updatedUser.isActive !== false) {
        await updatedUser.save();
      }
    }

    const updatedService = updatedUser.services.id(serviceId);

    if (!updatedService) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    res.json({
      success: true,
      message: `Service ${updatedService.isActive ? 'activated' : 'deactivated'} successfully`,
      data: updatedService
    });

  } catch (error) {
    console.error('Toggle service status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update service status'
    });
  }
}));











//9================ VERIFICATION
// Add profile verification request route
router.post('/verification/request', authenticateToken, asyncHandler(async (req, res) => {
  const user = req.user;
  const userType = req.userType;
  const Model = getModelByType(userType);

  if (!Model) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user type'
    });
  }

  // Check if user has premium or elite package
  const hasPremiumPackage = user.currentPackage?.status === 'active' &&
    (user.currentPackage?.packageType === 'premium' || user.currentPackage?.packageType === 'elite')

  if (!hasPremiumPackage) {
    return res.status(403).json({
      success: false,
      message: 'Profile verification is only available for Premium and Elite package holders'
    });
  }

  // Check if verification is already requested or approved
  // if (user.verification?.verificationRequested || user.verification?.profileVerified) {
  //   return res.status(400).json({
  //     success: false,
  //     message: user.verification?.profileVerified
  //       ? 'Your profile is already verified'
  //       : 'Verification request already submitted'
  //   });
  // }

  try {
    const updatedUser = await Model.findByIdAndUpdate(
      user._id,
      {
        $set: {
          'verification.verificationRequested': true,
          'verification.verificationRequestedAt': new Date(),
          'verification.verificationStatus': 'pending'
        }
      },
      { new: true }
    ).select('-password');


    res.json({
      success: true,
      message: 'Verification request submitted successfully! Our team will contact you via WhatsApp soon.',
      data: {
        verification: updatedUser.verification
      }
    });

  } catch (error) {
    console.error('Verification request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit verification request'
    });
  }
}));

// Get verification status
router.get('/verification/status', authenticateToken, asyncHandler(async (req, res) => {
  const user = req.user;
  const userType = req.userType;
  const Model = getModelByType(userType);

  if (!Model) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user type'
    });
  }

  const userData = await Model.findById(user._id).select('verification purchasedPackages');

  res.json({
    success: true,
    data: {
      verification: userData.verification,
      hasPremiumPackage: userData.purchasedPackages?.some(pkg =>
        pkg.status === 'active' &&
        new Date(pkg.expiryDate) > new Date() &&
        (pkg.packageType === 'premium' || pkg.packageType === 'elite')
      )
    }
  });
}));

// Admin route to approve/reject verification (you might want to add this later)
router.patch('/verification/:userId/status', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { status, notes } = req.body; // status: 'approved' or 'rejected'

  // In production, add admin authentication here
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid status. Must be "approved" or "rejected"'
    });
  }

  try {
    // Search across all user models
    const models = [
      { model: require('../models/Escort'), type: 'escort' },
      { model: require('../models/Masseuse'), type: 'masseuse' },
      { model: require('../models/OFModel'), type: 'of-model' },
      { model: require('../models/Spa'), type: 'spa' }
    ];

    let user = null;
    let userType = null;

    for (const { model, type } of models) {
      const foundUser = await model.findById(userId);
      if (foundUser) {
        user = foundUser;
        userType = type;
        break;
      }
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const Model = getModelByType(userType);
    const updatedUser = await Model.findByIdAndUpdate(
      userId,
      {
        $set: {
          'verification.profileVerified': status === 'approved',
          'verification.verificationStatus': status,
          'verification.verifiedAt': status === 'approved' ? new Date() : null,
          'verification.verificationNotes': notes
        }
      },
      { new: true }
    ).select('-password');

    // In production, send notification to user about verification status

    res.json({
      success: true,
      message: `Verification ${status} successfully`,
      data: {
        verification: updatedUser.verification
      }
    });

  } catch (error) {
    console.error('Admin verification update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update verification status'
    });
  }
}));

module.exports = router;