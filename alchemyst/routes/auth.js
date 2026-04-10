const express = require('express');
const asyncHandler = require('express-async-handler');
const Escort = require('../models/Escort');
const Masseuse = require('../models/Masseuse');
const OFModel = require('../models/OFModel');
const Spa = require('../models/Spa');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { sanitizeUser } = require('../utils/sanitizeUser');


const router = express.Router();

// Define valid user types
const VALID_USER_TYPES = ['escort', 'masseuse', 'of-model', 'spa'];

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

// Generate JWT token
const generateToken = (userId, userType) => {
  return jwt.sign(
    {
      userId: userId,
      userType: userType
    },
    process.env.ALCHEMYST_JWT_SECRET || 'your-fallback-secret-key',
    { expiresIn: '30d' }
  );
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

// Register endpoint
router.post('/register', asyncHandler(async (req, res) => {
  const { username, email, password, userType } = req.body;

  // Basic validation
  if (!username || !email || !password || !userType) {
    return res.status(400).json({
      success: false,
      message: 'All fields are required: username, email, password, userType'
    });
  }

  // Validate userType
  if (!VALID_USER_TYPES.includes(userType)) {
    return res.status(400).json({
      success: false,
      message: `Invalid user type. Must be one of: ${VALID_USER_TYPES.join(', ')}`
    });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedUsername = username.trim().toLowerCase();

  // Check conflicts separately so client can show precise errors.
  const [emailMatches, usernameMatches] = await Promise.all([
    Promise.all([
      Escort.exists({ email: normalizedEmail }),
      Masseuse.exists({ email: normalizedEmail }),
      OFModel.exists({ email: normalizedEmail }),
      Spa.exists({ email: normalizedEmail })
    ]),
    Promise.all([
      Escort.exists({ username: normalizedUsername }),
      Masseuse.exists({ username: normalizedUsername }),
      OFModel.exists({ username: normalizedUsername }),
      Spa.exists({ username: normalizedUsername })
    ])
  ]);

  const emailExists = emailMatches.some(Boolean);
  const usernameExists = usernameMatches.some(Boolean);

  if (emailExists || usernameExists) {
    let message = 'An account with these details already exists. Please log in.';

    if (emailExists && usernameExists) {
      message = 'Email and username are already in use. Please log in or use different details.';
    } else if (emailExists) {
      message = 'This email is already registered. Please log in or use another email.';
    } else if (usernameExists) {
      message = 'This username is already taken. Please choose another username.';
    }

    return res.status(409).json({
      success: false,
      error: 'ACCOUNT_EXISTS',
      conflicts: {
        email: emailExists,
        username: usernameExists
      },
      message
    });
  }

  // Hash password
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  // Get the appropriate model
  const Model = getModelByType(userType);
  if (!Model) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user type'
    });
  }

  // Create new user
  const newUser = new Model({
    username: normalizedUsername,
    email: normalizedEmail,
    password: hashedPassword,
    userType,
  });

  await newUser.save();

  // Generate JWT token
  const token = generateToken(newUser._id, userType);

  // Prepare response data
  const userData = {
    id: newUser._id,
    username: newUser.username,
    email: newUser.email,
    userType: userType,
    isActive: newUser.isActive,
    createdAt: newUser.createdAt
  };

  // Add verification status based on model structure
  if (userType === 'escort' || userType === 'masseuse' || userType === 'spa') {
    userData.isVerified = newUser.verification?.isVerified || false;
  } else if (userType === 'of-model') {
    userData.isVerified = newUser.verification?.isVerified || false;
  }

  res.status(201).json({
    success: true,
    message: `${userType.charAt(0).toUpperCase() + userType.slice(1)} registered successfully`,
    token: token,
    data: userData
  });
}));


router.post("/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required" });
  }

  const users = await Promise.all([
    Escort.findOne({ email: email.toLowerCase() }),
    Masseuse.findOne({ email: email.toLowerCase() }),
    OFModel.findOne({ email: email.toLowerCase() }),
    Spa.findOne({ email: email.toLowerCase() }),
  ]);

  let user = null;
  let userType = null;

  for (let i = 0; i < users.length; i++) {
    if (users[i]) {
      user = users[i];
      userType = VALID_USER_TYPES[i];
      break;
    }
  }

  if (!user) {
    return res.status(401).json({ success: false, message: "Invalid email or password" });
  }

  if (user.isDeactivated) {
    return res.status(401).json({
      success: false,
      message: "Account is deactivated. Please contact support."
    });
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return res.status(401).json({ success: false, message: "Invalid email or password" });
  }

  const token = generateToken(user._id, userType);
  const sanitizedUser = sanitizeUser(user);

  res.json({
    success: true,
    message: "Login successful",
    token,
    data: sanitizedUser
  });
}));

// Forgot Password - Send Reset Code
router.post('/forgot-password', asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Email is required'
    });
  }

  try {
    // Find user by email across all user types
    let user = null;
    let userType = null;
    let Model = null;

    for (const type of VALID_USER_TYPES) {
      Model = getModelByType(type);
      if (Model) {
        user = await Model.findOne({ email: email.toLowerCase() });
        if (user) {
          userType = type;
          break;
        }
      }
    }

    // SECURITY: Don't reveal if email exists or not
    if (!user) {
      return res.json({
        success: true,
        message: 'If the email exists, a reset code has been sent'
      });
    }

    // Generate reset code
    const resetCode = generateRandomCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Save reset code to user in database (like email verification)
    await Model.findByIdAndUpdate(user._id, {
      $set: {
        loginEmailVerificationCode: resetCode,
        loginEmailVerificationExpires: expiresAt
      }
    });

    // Send email with reset code
    try {
      const mailOptions = {
        from: process.env.ALCHEMYST_EMAIL,
        to: email,
        subject: 'Password Reset Code - Alchemyst',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 3px solid #ff1493; border-radius: 15px; overflow: hidden;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #ff1493, #ff69b4); padding: 30px 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">ALCHEMYST</h1>
              <p style="color: white; margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Password Reset</p>
            </div>
            
            <!-- Content -->
            <div style="padding: 30px 25px;">
              <h2 style="color: #333; margin-bottom: 20px; text-align: center;">Your Password Reset Code</h2>
              
              <!-- Code Display -->
              <div style="background: #fff0f7; border: 4px dashed #ff1493; border-radius: 12px; padding: 25px; text-align: center; margin: 25px 0;">
                <div style="font-size: 42px; font-weight: bold; color: #ff1493; letter-spacing: 8px; text-shadow: 2px 2px 4px rgba(255, 20, 147, 0.2);">
                  ${resetCode}
                </div>
              </div>
              
              <p style="color: #666; text-align: center; margin-bottom: 15px; font-size: 14px;">
                Enter this code in the Alchemyst app to reset your password.
              </p>
              
              <div style="background: #f8f8f8; border-radius: 8px; padding: 15px; margin: 20px 0;">
                <p style="color: #888; font-size: 12px; text-align: center; margin: 0;">
                  <strong>Code expires in 15 minutes</strong><br>
                  If you didn't request this reset, please ignore this email.
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
      };

      await transporter.sendMail(mailOptions);

      res.json({
        success: true,
        message: 'If the email exists, a reset code has been sent'
      });

    } catch (emailError) {
      console.error('Failed to send reset email:', emailError);
      return res.status(500).json({
        success: false,
        message: 'Failed to send reset code. Please try again.'
      });
    }

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process reset request'
    });
  }
}));


// Verify Reset Code
router.post('/verify-reset-code', asyncHandler(async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({
      success: false,
      message: 'Email and code are required'
    });
  }

  try {
    // Find user by email across all user types
    let user = null;
    let userType = null;
    let Model = null;

    for (const type of VALID_USER_TYPES) {
      Model = getModelByType(type);
      if (Model) {
        user = await Model.findOne({
          email: email.toLowerCase(),
          loginEmailVerificationCode: code
        });
        if (user) {
          userType = type;
          break;
        }
      }
    }

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset code'
      });
    }

    // Check if code has expired
    if (user.loginEmailVerificationExpires < new Date()) {
      // Clear expired code
      await Model.findByIdAndUpdate(user._id, {
        $set: {
          loginEmailVerificationCode: null,
          loginEmailVerificationExpires: null
        }
      });

      return res.status(400).json({
        success: false,
        message: 'Reset code has expired'
      });
    }

    res.json({
      success: true,
      message: 'Code verified successfully'
    });

  } catch (error) {
    console.error('Verify reset code error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify reset code'
    });
  }
}));

// Reset Password
// Reset Password
router.post('/reset-password', asyncHandler(async (req, res) => {
  const { email, code, newPassword } = req.body;

  if (!email || !code || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Email, code, and new password are required'
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters long'
    });
  }

  try {
    // Find user by email and code across all user types
    let user = null;
    let userType = null;
    let Model = null;

    for (const type of VALID_USER_TYPES) {
      Model = getModelByType(type);
      if (Model) {
        user = await Model.findOne({
          email: email.toLowerCase(),
          loginEmailVerificationCode: code
        });
        if (user) {
          userType = type;
          break;
        }
      }
    }

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset code'
      });
    }

    // Check if code has expired
    if (user.loginEmailVerificationExpires < new Date()) {
      // Clear expired code
      await Model.findByIdAndUpdate(user._id, {
        $set: {
          loginEmailVerificationCode: null,
          loginEmailVerificationExpires: null
        }
      });

      return res.status(400).json({
        success: false,
        message: 'Reset code has expired'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password and clear reset code
    await Model.findByIdAndUpdate(user._id, {
      $set: {
        password: hashedPassword,
        loginEmailVerificationCode: null,
        loginEmailVerificationExpires: null
      }
    });

    res.json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
}));

module.exports = router;