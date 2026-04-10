const express = require('express');
const asyncHandler = require('express-async-handler');
const router = express.Router();
const mongoose = require('mongoose');
const Staff = require('../models/staff'); // Create this model
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

// Configure multer (temporary storage)
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
        folder: "staff_profile_pictures",
        resource_type: "image",
        quality: "auto:good",
        fetch_format: "auto",
        width: 400,
        height: 400,
        crop: "fill",
        gravity: "face",
      },
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

// ✅ Get all Staff
router.get('/', asyncHandler(async (req, res) => {
  try {
    const staff = await Staff.find();
    res.json({ success: true, message: "Staff list retrieved successfully.", data: staff });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));

// ✅ Create a new staff (with profile picture upload)
router.post('/', upload.single('profilePicture'), asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { firstName, lastName, role, phone, email, kra, salary } = req.body;

    // Check for existing staff based on email, phone, or KRA
    const existingStaff = await Staff.findOne({
      $or: [{ email }, { phone }, { kra }]
    });

    if (existingStaff) {
      await session.abortTransaction();
      session.endSession();

      let conflictField;
      if (existingStaff.email === email) conflictField = "Email";
      else if (existingStaff.phone === phone) conflictField = "Phone number";
      else if (existingStaff.kra === kra) conflictField = "KRA PIN";

      return res.status(400).json({
        success: false,
        message: `${conflictField} already exists. Please use a different one.`
      });
    }

    let profileImageUrl = null;
    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.buffer);
        profileImageUrl = uploadResult.secure_url;
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
        return res.status(500).json({ error: "Profile image upload failed", details: error });
      }
    }

    
    const currentYear = new Date().getFullYear();
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    const newStaff = new Staff({
      firstName,
      lastName,
      role,
      phone,
      email,
      kra,
      salary,
      profilePicture: profileImageUrl,
      salaryPayments: months.map(month => ({
        month,
        year: currentYear,
        status: "pending"
      }))
    });

    const savedStaff = await newStaff.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({ success: true, message: "Staff added successfully", data: savedStaff });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: error.message });
  }
}));



// ✅ Update a staff member
router.put('/:id', upload.single('profilePicture'), asyncHandler(async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id);
    if (!staff) {
      return res.status(404).json({ success: false, message: "Staff not found" });
    }

    // Filter out unchanged fields
    let updatedData = {};
    Object.keys(req.body).forEach((key) => {
      if (req.body[key] && req.body[key] !== staff[key]) {
        updatedData[key] = req.body[key];
      }
    });

    // Handle profile picture update (only upload if changed)
    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer);
      updatedData.profilePicture = uploadResult.secure_url;
    }

    if (Object.keys(updatedData).length === 0) {
      return res.status(400).json({ success: false, message: "No changes detected" });
    }

    const updatedStaff = await Staff.findByIdAndUpdate(req.params.id, updatedData, { new: true });

    res.json({ success: true, message: "Staff updated successfully", data: updatedStaff });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));


// ✅ Delete a staff
router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const deletedStaff = await Staff.findByIdAndDelete(req.params.id);

    if (!deletedStaff) {
      return res.status(404).json({ success: false, message: "Staff not found" });
    }

    res.json({ success: true, message: "Staff deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));

module.exports = router;
