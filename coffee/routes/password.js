const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const User = require('../model/user');
const asyncHandler = require('express-async-handler');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const { generatePasswordResetTemplate } = require('../config/emailConfig');

const coffeeEmailUser = process.env.COFFEE_EMAIL || process.env.AROBISCA_EMAIL || process.env.EMAIL_USER;
const coffeeEmailPassword = process.env.COFFEE_EMAIL_PASSWORD || process.env.AROBISCA_EMAIL_PASSWORD || process.env.EMAIL_PASSWORD;

// Create email transporter service
const transporter = nodemailer.createTransport({
    service: 'gmail',
    port: 465,
    secure: true,
    logger: true,
    debug: false,
    secureConnection: false,
    auth: {
        user: coffeeEmailUser,
        pass: coffeeEmailPassword,
    },
    tls: {
        rejectUnauthorized: true
    }
});

// Helper function to generate random code
const generateRandomCode = () => {
    return Math.floor(1000 + Math.random() * 9000).toString(); // Generates a 4-digit code
};

// Request password reset
router.post('/requestPasswordReset', asyncHandler(async (req, res) => {
    const { email } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User does not exist in database' });
        }

        const resetCode = generateRandomCode();
        const expirationTime = Date.now() + 3600000; // 1 hour from now

        // Save the reset code and expiration time to the user
        user.resetCode = resetCode;
        user.resetCodeExpiration = expirationTime;
        await user.save();

        // Send reset code via email with beautiful template
        await transporter.sendMail({
            from: coffeeEmailUser,
            to: user.email,
            subject: 'Password Reset Request - Arobisca',
            html: generatePasswordResetTemplate(resetCode, user.username)
        });

        res.json({ success: true, message: 'Password reset code sent to your email' });
    } catch (error) {
        console.error('Error requesting password reset:', error);
        res.status(500).json({ success: false, message: 'Error requesting password reset', error: error.message });
    }
}));

// Verify reset code
router.post('/verifyResetCode', asyncHandler(async (req, res) => {
    const { email, resetCode } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User does not exist in database' });
        }

        if (user.resetCode !== resetCode || Date.now() > user.resetCodeExpiration) {
            return res.status(400).json({ success: false, message: 'Invalid or expired reset code' });
        }

        res.status(200).json({ success: true, message: 'Reset code verified' });
    } catch (error) {
        console.error('Error verifying reset code:', error);
        res.status(500).json({ success: false, message: 'Error verifying reset code', error: error.message });
    }
}));

// Reset password
router.post('/resetPassword', asyncHandler(async (req, res) => {
    const { email, resetCode, newPassword } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User does not exist in database' });
        }

        if (user.resetCode !== resetCode || Date.now() > user.resetCodeExpiration) {
            return res.status(400).json({ success: false, message: 'Invalid or expired reset code' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        user.resetCode = undefined;
        user.resetCodeExpiration = undefined;
        await user.save();

        res.status(200).json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({ success: false, message: 'Error resetting password', error: error.message });
    }
}));


// Request password reset
router.post('/requestEmailVerificationCode', asyncHandler(async (req, res) => {
    const { email } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User does not exist in database' });
        }

        const resetCode = generateRandomCode();
        const expirationTime = Date.now() + 3600000; // 1 hour from now

        // Save the reset code and expiration time to the user
        user.verificationCode = resetCode;
        user.verificationCodeExpiration = expirationTime;
        await user.save();

        // Send reset code via email
        await transporter.sendMail({
            to: user.email,
            subject: 'Email Verification Code',
            html: `<p>Your email verification code is <strong>${resetCode}</strong>. It will expire in 1 hour.</p>`
        });

        res.status(200).json({ success: true, message: 'Password reset code sent' });
    } catch (error) {
        console.error('Error requesting password reset:', error);
        res.status(500).json({ success: false, message: 'Error requesting password reset', error: error.message });
    }
}));

// Verify reset code
router.post('/verifyEmailCode', asyncHandler(async (req, res) => {
    const { email, resetCode } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User does not exist in database' });
        }

        if (user.verificationCode !== resetCode || Date.now() > user.verificationCodeExpiration) {
            return res.status(400).json({ success: false, message: 'Invalid or expired reset code' });
        }

        // Save the reset code and expiration time to the user
        user.isEmailVerified = true;
        await user.save();

        res.status(200).json({ success: true, message: 'Reset code verified' });
    } catch (error) {
        console.error('Error verifying reset code:', error);
        res.status(500).json({ success: false, message: 'Error verifying reset code', error: error.message });
    }
}));

module.exports = router;
