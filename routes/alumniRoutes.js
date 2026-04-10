const express = require('express');
const router = express.Router();
const Alumni = require('../models/Alumni');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const bcrypt = require('bcrypt');
const { transporter, generatePasswordResetTemplate } = require('../config/emailConfig');

// Multer in-memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.ZOEZI_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.ZOEZI_CLOUDINARY_API_KEY,
  api_secret: process.env.ZOEZI_CLOUDINARY_API_SECRET,
  secure: true
});

// Helper to generate 4-digit reset code
const generateResetCode = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

// Helper to upload buffer to Cloudinary
const uploadToCloudinary = (fileBuffer, folder = 'students_profile_pictures') => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto',
        transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }]
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    ).end(fileBuffer);
  });
};

// POST /alumni/login - Alumni login endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ status: 'error', message: 'Email and password required' });
    }

    // Find alumni by email
    const alumnus = await Alumni.findOne({ email: email.toLowerCase() });
    if (!alumnus) {
      return res.status(401).json({ status: 'error', message: 'Invalid email or password' });
    }

    // Compare passwords
    const passwordMatch = await bcrypt.compare(password, alumnus.password);
    if (!passwordMatch) {
      return res.status(401).json({ status: 'error', message: 'Invalid email or password' });
    }

    // Convert to plain object and remove password
    const alumniData = alumnus.toObject();
    delete alumniData.password;
    delete alumniData.resetCode;
    delete alumniData.resetCodeExpiry;

    // Add token
    alumniData.token = `token_${alumnus._id}_${Date.now()}`; // Simple token (implement JWT later)

    res.status(200).json({
      status: 'success',
      message: 'Login successful',
      data: alumniData
    });
  } catch (err) {
    console.error('Alumni login error:', err);
    res.status(500).json({ status: 'error', message: 'Login failed', error: err.message });
  }
});

// GET /alumni/list - list alumni with pagination, search, and alphabetical sorting by first name
router.get('/list', async (req, res) => {
  try {
    const { limit = 50, skip = 0, search } = req.query;
    const q = {};
    
    if (search) {
      const re = new RegExp(search, 'i');
      q.$or = [
        { firstName: re },
        { lastName: re },
        { email: re },
        { phone: re },
        { admissionNumber: re }
      ];
    }

    const total = await Alumni.countDocuments(q);
    
    // Sort by firstName A-Z (ascending order)
    const alumni = await Alumni.find(q)
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .sort({ firstName: 1 }) // 1 = ascending (A-Z), -1 = descending (Z-A)
      .select('-password');

    res.status(200).json({
      status: 'success',
      data: {
        alumni,
        pagination: {
          total,
          limit: parseInt(limit),
          skip: parseInt(skip)
        }
      }
    });
  } catch (err) {
    console.error('Get alumni error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch alumni',
      error: err.message
    });
  }
});

// PUT /alumni/:alumniId/update - Update alumni information by section
router.put('/:alumniId/update', upload.single('file'), async (req, res) => {
  try {
    const { alumniId } = req.params;
    const { section, data } = req.body;

    const alumnus = await Alumni.findById(alumniId);
    if (!alumnus) {
      return res.status(404).json({ status: 'error', message: 'Alumni not found' });
    }

    // Handle profile picture upload
    if (section === 'profile' && req.file) {
      // Delete old profile picture if exists
      if (alumnus.profilePicPublicId) {
        try {
          await cloudinary.uploader.destroy(alumnus.profilePicPublicId);
        } catch (deleteError) {
          console.error('Error deleting old profile image:', deleteError);
          // Continue with upload even if deletion fails
        }
      }

      // Upload new picture
      const imageData = await uploadToCloudinary(req.file.buffer);

      const updatedAlumnus = await Alumni.findByIdAndUpdate(
        alumniId,
        {
          profilePicture: imageData.secure_url,
          profilePicPublicId: imageData.public_id
        },
        { new: true }
      ).select('-password');

      return res.status(200).json({
        status: 'success',
        message: 'Profile picture updated successfully',
        data: updatedAlumnus
      });
    }

    // Handle other sections (info, personal, academic, financial, exams, cpd)
    if (!section || !data) {
      return res.status(400).json({ status: 'error', message: 'Section and data are required' });
    }

    let updateData = {};

    switch (section) {
      case 'info':
        updateData = {
          admissionNumber: data.admissionNumber
        };
        break;
      case 'personal':
        updateData = {
          firstName: data.firstName,
          lastName: data.lastName,
          dateOfBirth: data.dateOfBirth,
          gender: data.gender,
          email: data.email,
          phone: data.phone
        };
        break;
      case 'academic':
        updateData = {
          qualification: data.qualification,
          course: data.course,
          trainingMode: data.trainingMode,
          courseDuration: data.courseDuration
        };
        break;
      case 'financial':
        updateData = {
          courseFee: data.courseFee,
          upfrontFee: data.upfrontFee
        };
        break;
      case 'exams':
        updateData = {
          exams: data.exams
        };
        break;
      case 'cpd':
        updateData = {
          cpdRecords: data.cpdRecords
        };
        break;
      case 'public':
        updateData = {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
          currentLocation: data.currentLocation,
          bio: data.bio,
          nextOfKinName: data.nextOfKinName,
          nextOfKinRelationship: data.nextOfKinRelationship,
          nextOfKinPhone: data.nextOfKinPhone,
          practiceStatus: data.practiceStatus,
          isPublicProfileEnabled: data.isPublicProfileEnabled
        };
        break;
      default:
        return res.status(400).json({ status: 'error', message: 'Invalid section' });
    }

    const updatedAlumnus = await Alumni.findByIdAndUpdate(
      alumniId,
      updateData,
      { new: true }
    ).select('-password');

    res.status(200).json({
      status: 'success',
      message: `${section} information updated successfully`,
      data: updatedAlumnus
    });
  } catch (err) {
    console.error('Update alumni error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to update alumni', error: err.message });
  }
});

// PUT /alumni/:alumniId/verify - Verify alumni information
router.put('/:alumniId/verify', async (req, res) => {
  try {
    const { alumniId } = req.params;
    
    const alumnus = await Alumni.findByIdAndUpdate(
      alumniId,
      { adminVerified: true },
      { new: true }
    ).select('-password');
    
    if (!alumnus) {
      return res.status(404).json({ status: 'error', message: 'Alumni not found' });
    }
    
    res.status(200).json({
      status: 'success',
      message: 'Alumni verified successfully',
      data: alumnus
    });
  } catch (err) {
    console.error('Verify alumni error:', err);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to verify alumni', 
      error: err.message 
    });
  }
});

// PUT /alumni/:alumniId/public-profile - Update alumni's public profile info
router.put('/:alumniId/public-profile', async (req, res) => {
  try {
    const { alumniId } = req.params;
    const { practiceStatus, currentLocation, practicingSince, isPublicProfileEnabled } = req.body;

    const alumnus = await Alumni.findById(alumniId);
    if (!alumnus) {
      return res.status(404).json({ status: 'error', message: 'Alumni not found' });
    }

    const updateData = {};

    if (practiceStatus) {
      if (!['active', 'inactive', 'on_leave'].includes(practiceStatus)) {
        return res.status(400).json({ status: 'error', message: 'Invalid practice status' });
      }
      updateData.practiceStatus = practiceStatus;
    }

    if (currentLocation !== undefined) {
      updateData.currentLocation = currentLocation;
    }

    if (practicingSince !== undefined) {
      updateData.practicingSince = practicingSince ? new Date(practicingSince) : null;
    }

    if (isPublicProfileEnabled !== undefined) {
      updateData.isPublicProfileEnabled = isPublicProfileEnabled;
    }

    const updatedAlumnus = await Alumni.findByIdAndUpdate(
      alumniId,
      updateData,
      { new: true }
    ).select('-password');

    res.status(200).json({
      status: 'success',
      message: 'Public profile updated successfully',
      data: updatedAlumnus
    });
  } catch (err) {
    console.error('Update alumni public profile error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to update public profile', error: err.message });
  }
});

// PUT /alumni/:alumniId/change-password - Change alumni password
router.put('/:alumniId/change-password', async (req, res) => {
  try {
    const { alumniId } = req.params;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        status: 'error',
        message: 'Current password, new password, and confirmation required'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        status: 'error',
        message: 'New passwords do not match'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        status: 'error',
        message: 'New password must be at least 6 characters'
      });
    }

    if (newPassword === currentPassword) {
      return res.status(400).json({
        status: 'error',
        message: 'New password must be different from current password'
      });
    }

    // Find alumni
    const alumnus = await Alumni.findById(alumniId);
    if (!alumnus) {
      return res.status(404).json({
        status: 'error',
        message: 'Alumni not found'
      });
    }

    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, alumnus.password);
    if (!passwordMatch) {
      return res.status(401).json({
        status: 'error',
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    alumnus.password = hashedPassword;
    await alumnus.save();

    res.status(200).json({
      status: 'success',
      message: 'Password changed successfully'
    });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to change password',
      error: err.message
    });
  }
});

// POST /alumni/forgot-password - Request password reset code
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        status: 'error',
        message: 'Email address is required'
      });
    }

    // Find alumni by email
    const alumnus = await Alumni.findOne({ email: email.toLowerCase() });
    if (!alumnus) {
      // Don't reveal if email exists or not for security
      return res.status(200).json({
        status: 'success',
        message: 'If an account with that email exists, a reset code will be sent'
      });
    }

    // Generate reset code
    const resetCode = generateResetCode();
    const resetCodeExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Update alumni with reset code
    alumnus.resetCode = resetCode;
    alumnus.resetCodeExpiry = resetCodeExpiry;
    alumnus.resetAttempts = 0;
    await alumnus.save();

    // Send email using template
    const emailHtml = generatePasswordResetTemplate(alumnus.firstName, resetCode);
    const mailOptions = {
      from: process.env.ZOEZI_EMAIL,
      to: email.toLowerCase(),
      subject: 'Nairobi Zoezi - Password Reset Code',
      html: emailHtml
    };

    try {
      await transporter.sendMail(mailOptions);
    } catch (emailError) {
      console.error('Email send error:', emailError);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to send reset code. Please try again later.'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Reset code sent to your email',
      data: {
        email: email,
        expiresIn: 15 // minutes
      }
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to process password reset request',
      error: err.message
    });
  }
});

// POST /alumni/verify-reset-code - Verify reset code
router.post('/verify-reset-code', async (req, res) => {
  try {
    const { email, resetCode } = req.body;

    if (!email || !resetCode) {
      return res.status(400).json({
        status: 'error',
        message: 'Email and reset code are required'
      });
    }

    // Find alumni
    const alumnus = await Alumni.findOne({ email: email.toLowerCase() });
    if (!alumnus) {
      return res.status(404).json({
        status: 'error',
        message: 'Account not found'
      });
    }

    // Check if code exists and hasn't expired
    if (!alumnus.resetCode || !alumnus.resetCodeExpiry) {
      return res.status(400).json({
        status: 'error',
        message: 'No reset code requested. Please request a new one.'
      });
    }

    if (new Date() > alumnus.resetCodeExpiry) {
      // Clear expired code
      alumnus.resetCode = null;
      alumnus.resetCodeExpiry = null;
      alumnus.resetAttempts = 0;
      await alumnus.save();

      return res.status(400).json({
        status: 'error',
        message: 'Reset code has expired. Please request a new one.'
      });
    }

    // Check if too many attempts
    if (alumnus.resetAttempts >= 5) {
      return res.status(429).json({
        status: 'error',
        message: 'Too many failed attempts. Please request a new reset code.'
      });
    }

    // Verify code
    if (alumnus.resetCode !== resetCode) {
      alumnus.resetAttempts += 1;
      await alumnus.save();

      return res.status(400).json({
        status: 'error',
        message: 'Invalid reset code',
        attemptsRemaining: 5 - alumnus.resetAttempts
      });
    }

    // Code is valid
    res.status(200).json({
      status: 'success',
      message: 'Reset code verified successfully',
      data: {
        email: email,
        verified: true
      }
    });
  } catch (err) {
    console.error('Verify reset code error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to verify reset code',
      error: err.message
    });
  }
});

// POST /alumni/reset-password - Reset password with verified code
router.post('/reset-password', async (req, res) => {
  try {
    const { email, resetCode, newPassword, confirmPassword } = req.body;

    if (!email || !resetCode || !newPassword || !confirmPassword) {
      return res.status(400).json({
        status: 'error',
        message: 'All fields are required'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        status: 'error',
        message: 'Passwords do not match'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 6 characters'
      });
    }

    // Find alumni
    const alumnus = await Alumni.findOne({ email: email.toLowerCase() });
    if (!alumnus) {
      return res.status(404).json({
        status: 'error',
        message: 'Account not found'
      });
    }

    // Verify reset code and expiry
    if (!alumnus.resetCode || alumnus.resetCode !== resetCode) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired reset code'
      });
    }

    if (new Date() > alumnus.resetCodeExpiry) {
      alumnus.resetCode = null;
      alumnus.resetCodeExpiry = null;
      await alumnus.save();

      return res.status(400).json({
        status: 'error',
        message: 'Reset code has expired'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear reset code
    alumnus.password = hashedPassword;
    alumnus.resetCode = null;
    alumnus.resetCodeExpiry = null;
    alumnus.resetAttempts = 0;
    await alumnus.save();

    res.status(200).json({
      status: 'success',
      message: 'Password reset successfully. You can now login with your new password.'
    });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to reset password',
      error: err.message
    });
  }
});

// GET /alumni/:alumniId/subscription-history - Get subscription payment history
router.get('/:alumniId/subscription-history', async (req, res) => {
  try {
    const { alumniId } = req.params;

    const alumnus = await Alumni.findById(alumniId)
      .select('subscriptionPayments');

    if (!alumnus) {
      return res.status(404).json({
        status: 'error',
        message: 'Alumni not found'
      });
    }

    // Sort by year in descending order (current year first)
    const sortedPayments = alumnus.subscriptionPayments.sort((a, b) => b.year - a.year);

    res.status(200).json({
      status: 'success',
      data: {
        subscriptionPayments: sortedPayments,
        totalPayments: sortedPayments.length
      }
    });
  } catch (err) {
    console.error('Get subscription history error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch subscription history',
      error: err.message
    });
  }
});

// POST /alumni/:alumniId/subscription-payment - Record subscription payment after successful M-Pesa payment
router.post('/:alumniId/subscription-payment', async (req, res) => {
  try {
    const { alumniId } = req.params;
    const { year, amount, transactionId, numberOfYears } = req.body;

    if (!year || !amount || !transactionId) {
      return res.status(400).json({
        status: 'error',
        message: 'Year, amount, and transactionId are required'
      });
    }

    // Validate amount matches: KSh 1000 per year
    const expectedAmount = (numberOfYears || 1) * 1;
    if (amount !== expectedAmount) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid amount. Expected KSh ${expectedAmount}, got KSh ${amount}`
      });
    }

    const alumnus = await Alumni.findById(alumniId);
    if (!alumnus) {
      return res.status(404).json({
        status: 'error',
        message: 'Alumni not found'
      });
    }

    // Add payment for each year
    const newPayments = [];
    for (let i = 0; i < (numberOfYears || 1); i++) {
      const paymentYear = year + i;

      // Check if payment already exists for this year
      const existingPayment = alumnus.subscriptionPayments.find(p => p.year === paymentYear);
      if (existingPayment) {
        return res.status(400).json({
          status: 'error',
          message: `Payment for year ${paymentYear} already exists`
        });
      }

      const paymentDate = new Date();
      const expiryDate = new Date(paymentYear + 1, 0, 1); // Jan 1st of next year

      newPayments.push({
        year: paymentYear,
        status: 'paid',
        amount: 1,
        transactionId: i === 0 ? transactionId : `${transactionId}-${i}`, // Append suffix for multiple years
        paymentDate,
        expiryDate,
        profileActive: true
      });
    }

    // Add all payments to subscription history
    alumnus.subscriptionPayments.push(...newPayments);
    await alumnus.save();

    res.status(200).json({
      status: 'success',
      message: `Subscription payment(s) recorded successfully for ${numberOfYears || 1} year(s)`,
      data: {
        alumniId,
        paymentsAdded: newPayments.length,
        payments: newPayments
      }
    });
  } catch (err) {
    console.error('Record subscription payment error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to record subscription payment',
      error: err.message
    });
  }
});

// GET /alumni/:alumniId/cpd-history - Get CPD exam history
router.get('/:alumniId/cpd-history', async (req, res) => {
  try {
    const { alumniId } = req.params;

    const alumnus = await Alumni.findById(alumniId)
      .select('cpdRecords');

    if (!alumnus) {
      return res.status(404).json({
        status: 'error',
        message: 'Alumni not found'
      });
    }

    // Sort by year in descending order (current year first)
    const sortedRecords = (alumnus.cpdRecords || []).sort((a, b) => b.year - a.year);

    res.status(200).json({
      status: 'success',
      data: sortedRecords
    });
  } catch (err) {
    console.error('Get CPD history error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch CPD history',
      error: err.message
    });
  }
});

// GET /alumni/admin/subscription-stats/:year - Get subscription statistics for a specific year
router.get('/admin/subscription-stats/:year', async (req, res) => {
  try {
    const { year } = req.params;
    const yearNum = parseInt(year);

    if (!yearNum || yearNum < 2000 || yearNum > 2100) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid year provided'
      });
    }

    // Get all alumni with subscription data
    const allAlumni = await Alumni.find({}).select('subscriptionPayments firstName lastName email phone');

    // Filter and calculate stats for the given year
    const paidCount = allAlumni.filter(a =>
      a.subscriptionPayments.some(p => p.year === yearNum && p.status === 'paid')
    ).length;

    const pendingCount = allAlumni.filter(a =>
      a.subscriptionPayments.some(p => p.year === yearNum && p.status === 'pending')
    ).length;

    const expiredCount = allAlumni.filter(a =>
      a.subscriptionPayments.some(p => p.year === yearNum && p.status === 'expired')
    ).length;

    const neverPaidCount = allAlumni.filter(a =>
      !a.subscriptionPayments.some(p => p.year === yearNum)
    ).length;

    // Calculate revenue by method
    const revenueByMethod = {};
    let totalRevenue = 0;
    const paymentMethods = ['mpesa', 'cash', 'bank_transfer', 'cheque', 'paypal'];

    paymentMethods.forEach(method => {
      const methodAmount = allAlumni.reduce((sum, alumnus) => {
        const payment = alumnus.subscriptionPayments.find(p =>
          p.year === yearNum && p.status === 'paid' && (p.paymentMethod === method || (method === 'mpesa' && !p.paymentMethod))
        );
        return sum + (payment ? payment.amount : 0);
      }, 0);
      revenueByMethod[method] = methodAmount;
      totalRevenue += methodAmount;
    });

    // Get list of paid alumni for this year
    const paidAlumni = allAlumni
      .filter(a => a.subscriptionPayments.some(p => p.year === yearNum && p.status === 'paid'))
      .map(a => {
        const payment = a.subscriptionPayments.find(p => p.year === yearNum);
        return {
          _id: a._id,
          firstName: a.firstName,
          lastName: a.lastName,
          email: a.email,
          phone: a.phone,
          paymentDate: payment.paymentDate,
          paymentMethod: payment.paymentMethod || 'mpesa',
          transactionId: payment.transactionId,
          amount: payment.amount
        };
      })
      .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));

    res.status(200).json({
      status: 'success',
      data: {
        year: yearNum,
        stats: {
          paid: paidCount,
          pending: pendingCount,
          expired: expiredCount,
          neverPaid: neverPaidCount,
          totalRevenue,
          revenueByMethod,
          totalAlumni: allAlumni.length,
          conversionRate: ((paidCount / allAlumni.length) * 100).toFixed(2) + '%'
        },
        paidAlumni
      }
    });
  } catch (err) {
    console.error('Get subscription stats error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch subscription statistics',
      error: err.message
    });
  }
});

// PUT /alumni/:alumniId/admin/subscription-payment - Admin update subscription payment
router.put('/:alumniId/admin/subscription-payment', async (req, res) => {
  try {
    const { alumniId } = req.params;
    const { year, amount, paymentMethod, transactionId } = req.body;

    if (!year || !amount || !paymentMethod) {
      return res.status(400).json({
        status: 'error',
        message: 'Year, amount, and payment method are required'
      });
    }

    if (!['mpesa', 'cash', 'bank_transfer', 'cheque', 'paypal'].includes(paymentMethod)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid payment method'
      });
    }

    const alumnus = await Alumni.findById(alumniId);
    if (!alumnus) {
      return res.status(404).json({
        status: 'error',
        message: 'Alumni not found'
      });
    }

    // Find or create payment record for this year
    const existingPayment = alumnus.subscriptionPayments.find(p => p.year === year);

    if (existingPayment) {
      // Update existing payment
      existingPayment.status = 'paid';
      existingPayment.amount = amount;
      existingPayment.paymentMethod = paymentMethod;
      existingPayment.transactionId = transactionId || null;
      existingPayment.paymentDate = new Date();
      existingPayment.expiryDate = new Date(year + 1, 0, 1); // Jan 1st of next year
      existingPayment.profileActive = true;
      existingPayment.updatedAt = new Date();
    } else {
      // Create new payment record
      alumnus.subscriptionPayments.push({
        year,
        status: 'paid',
        amount,
        paymentMethod,
        transactionId: transactionId || null,
        paymentDate: new Date(),
        expiryDate: new Date(year + 1, 0, 1),
        profileActive: true
      });
    }

    await alumnus.save();

    res.status(200).json({
      status: 'success',
      message: `Subscription payment updated for year ${year}`,
      data: {
        alumniId,
        year,
        payment: alumnus.subscriptionPayments.find(p => p.year === year)
      }
    });
  } catch (err) {
    console.error('Admin update subscription payment error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update subscription payment',
      error: err.message
    });
  }
});

// GET /alumni/admin/search-alumni - Search alumni for subscription updates
router.get('/admin/search-alumni', async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.length < 2) {
      return res.status(400).json({
        status: 'error',
        message: 'Search query must be at least 2 characters'
      });
    }

    const re = new RegExp(query, 'i');
    const alumni = await Alumni.find({
      $or: [
        { firstName: re },
        { lastName: re },
        { email: re },
        { phone: re },
        { admissionNumber: re }
      ]
    })
      .select('firstName lastName email phone admissionNumber subscriptionPayments')
      .limit(20);

    res.status(200).json({
      status: 'success',
      data: alumni
    });
  } catch (err) {
    console.error('Search alumni error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to search alumni',
      error: err.message
    });
  }
});

// DELETE /alumni/:id - Delete alumni by ID
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Find and delete the alumni
    const deletedAlumnus = await Alumni.findByIdAndDelete(id);

    if (!deletedAlumnus) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'Alumni not found' 
      });
    }

    // If alumni had a profile picture, delete it from Cloudinary
    if (deletedAlumnus.profilePicPublicId) {
      try {
        await cloudinary.uploader.destroy(deletedAlumnus.profilePicPublicId);
      } catch (cloudinaryError) {
        console.error('Error deleting profile image from Cloudinary:', cloudinaryError);
        // Continue with deletion even if Cloudinary delete fails
      }
    }

    res.status(200).json({
      status: 'success',
      message: 'Alumni deleted successfully',
      data: { _id: id }
    });
  } catch (err) {
    console.error('Delete alumni error:', err);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to delete alumni', 
      error: err.message 
    });
  }
});

// Alumni Registration Route
router.post('/register', async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      dateOfBirth,
      gender,
      qualification,
      course,
      trainingMode,
      preferredIntake,
      preferredStartDate,
      startDate,
      citizenship,
      idNumber,
      kcseGrade,
      admnNumber,
      howHeardAbout,
      otherSource,
      feePayer,
      feePayerPhone,
      nextOfKinName,
      nextOfKinRelationship,
      nextOfKinPhone,
      graduationDate,
      currentLocation,
      bio,
      practiceStatus
    } = req.body;

    // Check if alumni already exists
    const existingAlumni = await Alumni.findOne({ email });
    if (existingAlumni) {
      return res.status(400).json({
        status: 'error',
        message: 'An alumni with this email already exists'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new alumni
    const newAlumni = new Alumni({
      // Basic Info
      firstName,
      lastName,
      email,
      phone,
      password: hashedPassword,
      dateOfBirth,
      gender,
      userType: 'alumni',
      
      // Admission Info - leave blank/null
      admissionNumber: admnNumber,
      applicationRef: '',
      
      // Education Info
      qualification,
      course,
      trainingMode,
      preferredIntake,
      preferredStartDate,
      startDate,
      
      // Personal Details
      citizenship,
      idNumber,
      kcseGrade,
      
      // Application History
      howHeardAbout: Array.isArray(howHeardAbout) ? howHeardAbout : [],
      otherSource,
      
      // Finance - set defaults
      courseFee: 75000,
      upfrontFee: 75000,
      feePayer,
      feePayerPhone,
      
      // Emergency Contact
      nextOfKinName,
      nextOfKinRelationship,
      nextOfKinPhone,
      
      // Course Specific Info
      courseDuration: "6 months",
      exams: [], // Leave blank
      
      // Media & Status
      profilePicture: {
        url: null,
        cloudinaryId: null
      },
      status: 'alumni',
      
      // Graduation Info
      graduationDate: graduationDate || new Date(),
      
      // Public Profile Fields
      verified: true,
      adminVerified: false,
      practiceStatus: practiceStatus || 'active',
      practicingSince: graduationDate || new Date(),
      currentLocation: currentLocation || '',
      isPublicProfileEnabled: true,
      bio: bio || '',
      
      // Password Reset Fields
      resetCode: null,
      resetCodeExpiry: null,
      resetAttempts: 0,
      
      // Subscription - leave blank
      subscription: {
        active: false,
        expiryDate: null,
        yearsSubscribed: 0,
        lastPaymentDate: null,
        autoRenew: false
      },
      
      // Leave arrays empty
      subscriptionPayments: [],
      courses: [],
      cpdRecords: []
    });

    await newAlumni.save();

    res.status(201).json({
      status: 'success',
      message: 'Alumni registered successfully',
      data: {
        id: newAlumni._id,
        firstName: newAlumni.firstName,
        lastName: newAlumni.lastName,
        email: newAlumni.email
      }
    });
  } catch (error) {
    console.error('Alumni registration error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to register alumni',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

module.exports = router;
