const express = require('express');
const asyncHandler = require('express-async-handler');
const router = express.Router();
const User = require('../model/user');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const secret = process.env.COFFEE_JWT_SECRET || process.env.JWT_SECRET;
const coffeeEmailUser = process.env.COFFEE_EMAIL || process.env.AROBISCA_EMAIL || process.env.EMAIL_USER;
const { transporter, generateVerificationEmailTemplate } = require('../config/emailConfig');

// Helper function to generate random code
// Helper function to generate random code
const generateRandomCode = () => {
    return Math.floor(1000 + Math.random() * 9000).toString(); // Generates a 4-digit code
};

// Get all users
router.get('/', asyncHandler(async (req, res) => {
    try {
        const users = await User.find();
        res.json({ success: true, message: "Users retrieved successfully.", data: users });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Login user
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    try {
        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, message: 'User Does not exist in database. Please Create an Acoount to Login' });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'You entered the wrong password. Check Password and try again.' });
        }

        // Generate JWT
        const token = jwt.sign({ userId: user._id }, secret, { expiresIn: '1h' });

        res.status(200).json({ success: true, message: "Login successful.", data: user, token });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ success: false, message: 'Error logging in', error: error.message });
    }
});

// Get a user by ID
router.get('/:id', asyncHandler(async (req, res) => {
    try {
        const userID = req.params.id;
        const user = await User.findById(userID);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }
        res.json({ success: true, message: "User retrieved successfully.", data: user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Register new user with email verification
router.post('/register', asyncHandler(async (req, res) => {
    const { username, email, phoneNumber, password, accountType, companyName, address, kraPin } = req.body;

    // Validate common required fields
    if (!email || !phoneNumber || !password || !accountType) {
        return res.status(400).json({ success: false, message: 'Email, phone number, password, and account type are required' });
    }

    // Validate account type
    if (!['personal', 'business'].includes(accountType)) {
        return res.status(400).json({ success: false, message: 'Invalid account type' });
    }

    // Validate personal account specific fields
    if (accountType === 'personal' && !username) {
        return res.status(400).json({ success: false, message: 'Username is required for personal accounts' });
    }

    // Validate business account specific fields
    if (accountType === 'business') {
        if (!companyName || !address || !kraPin) {
            return res.status(400).json({ success: false, message: 'Company name, address, and KRA pin are required for business accounts' });
        }
    }

    try {
        // Generate username for business accounts if not provided
        let finalUsername = username;
        if (accountType === 'business' && !username) {
            // Use company name to generate a username (remove spaces and special chars)
            finalUsername = companyName
                .toLowerCase()
                .replace(/\s+/g, '_')
                .replace(/[^a-z0-9_]/g, '');
            
            // Check if this username already exists and append random numbers if needed
            let counter = 1;
            let tempUsername = finalUsername;
            while (await User.findOne({ username: tempUsername })) {
                tempUsername = `${finalUsername}_${counter}`;
                counter++;
            }
            finalUsername = tempUsername;
        }

        // Check if user already exists (by email or username)
        const existingUser = await User.findOne({ 
            $or: [
                { email }, 
                { username: finalUsername }
            ] 
        });
        
        if (existingUser) {
            if (existingUser.email === email) {
                return res.status(400).json({ success: false, message: 'Email already in use' });
            }
            if (existingUser.username === finalUsername) {
                return res.status(400).json({ success: false, message: 'Username already in use' });
            }
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user data object
        const userData = {
            username: finalUsername,
            email,
            phoneNumber,
            password: hashedPassword,
            accountType,
            isEmailVerified: false,
            verificationRequestCount: 0
        };

        // Add business fields if it's a business account
        if (accountType === 'business') {
            userData.companyName = companyName;
            userData.address = address;
            userData.kraPin = kraPin;
        }

        // Create new user
        const newUser = new User(userData);
        await newUser.save();

        // Generate and send verification code
        const verificationCode = generateRandomCode();
        const expirationTime = new Date(Date.now() + 3600000); // 1 hour from now

        newUser.verificationCode = verificationCode;
        newUser.verificationCodeExpiration = expirationTime;
        newUser.verificationRequestCount = 1;
        newUser.lastVerificationRequest = new Date();
        await newUser.save();

        // Send verification email
        try {
            await transporter.sendMail({
                from: coffeeEmailUser,
                to: newUser.email,
                subject: 'Verify Your Email - Arobisca',
                html: generateVerificationEmailTemplate(verificationCode, newUser.username)
            });
        } catch (emailError) {
            console.error('Error sending verification email:', emailError);
            // Continue even if email fails, but log the error
        }

        res.json({
            success: true,
            message: `User created successfully!${accountType === 'business' ? ' Welcome to Arobisca Business!' : ''}`,
            data: newUser
        });
    } catch (error) {
        console.error('Error during registration:', error);
        res.status(500).json({ success: false, message: 'Error registering user', error: error.message });
    }
}));

// Request email verification code
router.post('/requestEmailVerificationCode', asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required' });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User does not exist in database' });
        }

        // Check if user is already verified
        if (user.isEmailVerified) {
            return res.status(400).json({ success: false, message: 'Email is already verified' });
        }

        // Check rate limiting (max 10 requests)
        if (user.verificationRequestCount >= 10) {
            const timeSinceLastRequest = Date.now() - user.lastVerificationRequest;
            const twentyFourHours = 24 * 60 * 60 * 1000;

            if (timeSinceLastRequest < twentyFourHours) {
                return res.status(429).json({
                    success: false,
                    message: 'Maximum verification requests reached. Please try again after 24 hours.'
                });
            } else {
                // Reset counter if 24 hours have passed
                user.verificationRequestCount = 0;
            }
        }

        const verificationCode = generateRandomCode();
        const expirationTime = new Date(Date.now() + 3600000); // 1 hour from now

        // Update user with new verification code
        user.verificationCode = verificationCode;
        user.verificationCodeExpiration = expirationTime;
        user.verificationRequestCount += 1;
        user.lastVerificationRequest = new Date();
        await user.save();

        // Send verification email
        try {
            await transporter.sendMail({
                from: coffeeEmailUser,
                to: user.email,
                subject: 'Your Verification Code - Arobisca',
                html: generateVerificationEmailTemplate(verificationCode, user.username)
            });

            res.json({
                success: true,
                message: 'Verification code sent successfully'
            });
        } catch (emailError) {
            console.error('Error sending verification email:', emailError);
            res.status(500).json({
                success: false,
                message: 'Error sending verification email'
            });
        }

    } catch (error) {
        console.error('Error requesting verification code:', error);
        res.status(500).json({
            success: false,
            message: 'Error requesting verification code',
            error: error.message
        });
    }
}));

// Verify email code
router.post('/verifyEmailCode', asyncHandler(async (req, res) => {
    const { email, verificationCode } = req.body;

    if (!email || !verificationCode) {
        return res.status(400).json({ success: false, message: 'Email and verification code are required' });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User does not exist in database' });
        }

        // Check if code matches and is not expired
        if (user.verificationCode !== verificationCode) {
            return res.status(400).json({ success: false, message: 'Invalid verification code' });
        }

        if (Date.now() > user.verificationCodeExpiration) {
            return res.status(400).json({ success: false, message: 'Verification code has expired' });
        }

        // Mark email as verified and clear verification data
        user.isEmailVerified = true;
        user.verificationCode = undefined;
        user.verificationCodeExpiration = undefined;
        user.verificationRequestCount = 0;
        await user.save();

        res.json({
            success: true,
            message: 'Email verified successfully'
        });
    } catch (error) {
        console.error('Error verifying email code:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying email code',
            error: error.message
        });
    }
}));

// Update a user
router.put('/:id', asyncHandler(async (req, res) => {
    try {
        const userID = req.params.id;
        const { username, email, phoneNumber } = req.body;

        if (!username || !email) {
            return res.status(400).json({ success: false, message: "Name and email are required." });
        }

        // Get the current user from the database
        const existingUser = await User.findById(userID);
        if (!existingUser) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        // Check if the email has changed
        let emailChanged = existingUser.email !== email;

        // Prepare update fields
        const updateData = { username, email, phoneNumber };
        if (emailChanged) {
            updateData.isEmailVerified = false; // reset verification if email changed
        }

        // Update the user
        const updatedUser = await User.findByIdAndUpdate(
            userID,
            updateData,
            { new: true }
        );

        res.json({
            success: true,
            message: `User updated successfully${emailChanged ? ' (email changed, verification reset).' : '.'}`,
            data: updatedUser
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Add a shipping address
router.post('/:id/shipping-addresses', asyncHandler(async (req, res) => {
    try {
        const userId = req.params.id;
        console.log(`userId`, userId);
        const { firstName, lastName, address, apartment, city, postalCode } = req.body;

        // Validate input
        if (!firstName || !lastName || !address || !city || !postalCode) {
            return res.status(400).json({ success: false, message: "All required fields must be provided." });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }
        console.log(`user`, user);

        // Check limit
        if (user.shippingAddresses.length >= 3) {
            return res.status(400).json({ success: false, message: "Maximum of 3 shipping addresses allowed." });
        }

        // Add address
        user.shippingAddresses.push({ firstName, lastName, address, apartment, city, postalCode });
        await user.save();

        res.json({
            success: true,
            message: "Shipping address added successfully.",
            data: user,
        });
    } catch (error) {
        console.error("Error adding shipping address:", error);
        res.status(500).json({ success: false, message: "Server error." });
    }
}));

// DELETE /users/:userId/shipping-addresses/:addressId
router.delete("/:userId/shipping-addresses/:addressId", async (req, res) => {
    try {
        const { userId, addressId } = req.params;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        user.shippingAddresses = user.shippingAddresses.filter(
            (addr) => addr._id.toString() !== addressId
        );

        await user.save();

        res.json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Change user password
router.put('/:id/password', asyncHandler(async (req, res) => {
  const userId = req.params.id;
  const { currentPassword, newPassword } = req.body;

  // Validate input
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: "Both current and new passwords are required." });
  }

  // Find the user
  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found." });
  }

  // Verify current password
  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    return res.status(400).json({ success: false, message: "Current password is incorrect." });
  }

  // Hash and update new password
  const hashedNewPassword = await bcrypt.hash(newPassword, 10);
  user.password = hashedNewPassword;

  await user.save();

  res.json({
    success: true,
    message: "Password changed successfully.",
  });
}));

// Delete a user
router.delete('/:id', asyncHandler(async (req, res) => {
    try {
        const userID = req.params.id;
        const deletedUser = await User.findByIdAndDelete(userID);
        if (!deletedUser) {
            return res.status(404).json({ success: false, message: "User not found." });
        }
        res.json({ success: true, message: "User deleted successfully." });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

module.exports = router;
