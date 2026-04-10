// routes/admin.js
const express = require('express');
const asyncHandler = require('express-async-handler');
const bcrypt = require('bcrypt');
const router = express.Router();
const Admin = require('../models/admin');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

// Configure multer storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Cloudinary Config
cloudinary.config({
  cloud_name: process.env.AROBISCA_SMS_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.AROBISCA_SMS_CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.AROBISCA_SMS_CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Upload to Cloudinary function
const uploadToCloudinary = (fileBuffer) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder: "admin_profiles",
        resource_type: "image",
        quality: "auto:good",
        fetch_format: "auto",
        width: 400,
        height: 400,
        crop: "fill",
        gravity: "face",
      },
      (error, result) => {
        if (error) reject({ message: "Image upload failed", error });
        else resolve(result);
      }
    ).end(fileBuffer);
  });
};

// Get all admins
router.get('/', asyncHandler(async (req, res) => {
  try {
    const admins = await Admin.find();
    res.json({ success: true, message: "Admins retrieved successfully", data: admins });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));

// Create new admin
router.post('/create', upload.single('profileImage'), asyncHandler(async (req, res) => {
  try {
    let profileImageUrl = null;
    let profilePicPublicId = null;

    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.buffer);
        profileImageUrl = uploadResult.secure_url;
        profilePicPublicId = uploadResult.public_id;
      } catch (error) {
        return res.status(500).json({ error: "Profile image upload failed", details: error });
      }
    }
    const { username, password, role, isBlockedAccess } = req.body;

    // Check for required fields
    if (!username || !password || !role) {
      return res.status(400).json({ error: "Username, password and role are required" });
    }

    // Check for duplicate username
    const existingAdmin = await Admin.findOne({ username });
    if (existingAdmin) {
      return res.status(400).json({ error: "Username already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const adminData = {
      username,
      password: hashedPassword,
      role,
      profileImage: profileImageUrl,
      profilePicPublicId,
      isBlockedAccess: isBlockedAccess,
    };

    const newAdmin = await Admin.create(adminData);

    // Remove sensitive data before sending response
    const adminResponse = newAdmin.toObject();
    delete adminResponse.password;
    delete adminResponse.token;

    res.status(201).json({
      success: true,
      message: 'Admin created successfully',
      data: adminResponse
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));

// Update admin
router.put('/:id', upload.single('profileImage'), asyncHandler(async (req, res) => {
  try {
    const adminId = req.params.id;
    const updateData = { ...req.body };

    // Remove fields that shouldn't be updated directly
    delete updateData.password;
    delete updateData.token;
    delete updateData.profileImage;
    delete updateData.profilePicPublicId;

    // If password is being updated, hash it
    if (req.body.password) {
      updateData.password = await bcrypt.hash(req.body.password, 10);
    }

    // Get existing admin data
    const existingAdmin = await Admin.findById(adminId);
    if (!existingAdmin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    // Update admin with new data
    const updatedAdmin = await Admin.findByIdAndUpdate(
      adminId,
      { $set: updateData },
      { new: true }
    ).select('-password -token');

    res.json({
      success: true,
      message: "Admin updated successfully",
      data: updatedAdmin
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));

// Toggle Access
router.put('/:id/toggle-access', asyncHandler(async (req, res) => {
  try {
    const adminId = req.params.id;
    
    // Find the admin
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    // Toggle the isBlockedAccess field
    const updatedAdmin = await Admin.findByIdAndUpdate(
      adminId,
      { $set: { isBlockedAccess: !admin.isBlockedAccess } },
      { new: true }
    ).select('-password -token');

    const accessStatus = updatedAdmin.isBlockedAccess ? 'blocked' : 'unblocked';
    
    res.json({
      success: true,
      message: `Admin access ${accessStatus} successfully`,
      data: updatedAdmin
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));

// Delete admin
router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    // Delete profile image from Cloudinary if it exists
    if (admin.profilePicPublicId) {
      await cloudinary.uploader.destroy(admin.profilePicPublicId);
    }

    await Admin.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Admin deleted successfully"
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));

module.exports = router;