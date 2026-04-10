const express = require('express');
const asyncHandler = require('express-async-handler');
const router = express.Router();
const mongoose = require('mongoose');
const Tutor = require('../models/tutors'); // Create this model
const multer = require('multer');
const bcrypt = require('bcrypt');
const cloudinary = require('cloudinary').v2;
const resetOldSalaries = require("../middleware/resetOldSalaries");
const resetUnassignedTutors = require("../middleware/resetUnassignedTutors");

// Middlewere functions
router.use(resetOldSalaries);
router.use(resetUnassignedTutors);

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
        folder: "tutor_profile_pictures",
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

// ✅ Get all tutors
router.get('/', asyncHandler(async (req, res) => {
  try {
    const tutors = await Tutor.find();
    res.json({ success: true, message: "Tutors retrieved successfully.", data: tutors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));



// ✅ Create a new tutor (with profile picture upload)
router.post('/', upload.single('profilePicture'), asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { firstName, lastName, role, phone, email, kra, salary } = req.body;

    // Check for existing tutor based on email, phone, or KRA
    const existingTutor = await Tutor.findOne({
      $or: [{ email }, { phone }, { kra }]
    });

    if (existingTutor) {
      await session.abortTransaction();
      session.endSession();

      let conflictField;
      if (existingTutor.email === email) conflictField = "Email";
      else if (existingTutor.phone === phone) conflictField = "Phone number";
      else if (existingTutor.kra === kra) conflictField = "KRA PIN";

      return res.status(400).json({
        success: false,
        message: `${conflictField} already exists. Please use a different one.`
      });
    }

    let profileImageUrl = null;
    let profilePicPublicId = null;

    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.buffer);
        profileImageUrl = uploadResult.secure_url;
        profilePicPublicId = uploadResult.public_id;
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
        return res.status(500).json({ error: "Profile image upload failed", details: error });
      }
    }

    // Hash phone number for password
    const hashedPassword = await bcrypt.hash(phone, 10);

    const currentYear = new Date().getFullYear();
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    const newTutor = new Tutor({
      firstName,
      lastName,
      role,
      phone,
      studentCount: 0,
      email,
      kra,
      salary,
      currentCohort: "",
      status: "Available",
      password: hashedPassword,
      profilePicture: profileImageUrl,
      profilePicPublicId,
      salaryPayments: months.map(month => ({
        month,
        year: currentYear,
        status: "pending"
      }))
    });
    const savedTutor = await newTutor.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({ success: true, message: "Tutor added successfully", data: savedTutor });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: error.message });
  }
}));

// ✅ Get a tutor by ID
router.get('/:id', asyncHandler(async (req, res) => {
  try {
    const tutor = await Tutor.findById(req.params.id);

    if (!tutor) {
      return res.status(404).json({ success: false, message: "Tutor not found" });
    }

    res.json({ success: true, message: "Tutor retrieved successfully.", data: tutor });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));



// ✅ Update a tutor
router.put('/:id', upload.single('profilePicture'), asyncHandler(async (req, res) => {
  try {
    const tutor = await Tutor.findById(req.params.id);
    if (!tutor) {
      return res.status(404).json({ success: false, message: "Tutor not found" });
    }

    // Filter out unchanged fields
    let updatedData = {};
    Object.keys(req.body).forEach((key) => {
      if (req.body[key] && req.body[key] !== tutor[key]) {
        updatedData[key] = req.body[key];
      }
    });

    // Handle profile picture update (only upload if changed)
    if (req.file) {
      try {
        // Delete existing profile image from Cloudinary if it exists
        if (tutor.profilePicPublicId) {
          await cloudinary.uploader.destroy(tutor.profilePicPublicId);
        }
        const uploadResult = await uploadToCloudinary(req.file.buffer);
        updatedData.profilePicture = uploadResult.secure_url;
        updatedData.profilePicPublicId = uploadResult.public_id;
      } catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Profile image upload failed", details: error });
      }
    }

    if (Object.keys(updatedData).length === 0) {
      return res.status(400).json({ success: false, message: "No changes detected" });
    }

    const updatedTutor = await Tutor.findByIdAndUpdate(req.params.id, updatedData, { new: true });

    res.json({ success: true, message: "Tutor updated successfully", data: updatedTutor });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));

// ✅ Change password
router.put('/:id/change-password', asyncHandler(async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const { id } = req.params;

    const tutor = await Tutor.findById(id);
    if (!tutor) {
      return res.status(404).json({ success: false, message: "Tutor not found" });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, tutor.password);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, message: "Current password is incorrect" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    tutor.password = hashedPassword;
    await tutor.save();

    res.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));

// ✅ Update phone number
router.put('/:id/update-phone', asyncHandler(async (req, res) => {
  try {
    const { phone } = req.body;
    const { id } = req.params;

    // Check if phone already exists
    const existingTutor = await Tutor.findOne({ phone, _id: { $ne: id } });
    if (existingTutor) {
      return res.status(400).json({ success: false, message: "Phone number already in use" });
    }

    const tutor = await Tutor.findById(id);
    if (!tutor) {
      return res.status(404).json({ success: false, message: "Tutor not found" });
    }

    // Update phone
    tutor.phone = phone;
    await tutor.save();

    res.json({ success: true, message: "Phone number updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));

// ✅ Change email
router.put('/:id/change-email', asyncHandler(async (req, res) => {
  try {
    const { newEmail, password } = req.body;
    const { id } = req.params;

    // Check if email already exists
    const existingTutor = await Tutor.findOne({ email: newEmail, _id: { $ne: id } });
    if (existingTutor) {
      return res.status(400).json({ success: false, message: "Email already in use" });
    }

    const tutor = await Tutor.findById(id);
    if (!tutor) {
      return res.status(404).json({ success: false, message: "Tutor not found" });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, tutor.password);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, message: "Password is incorrect" });
    }

    // Update email
    tutor.email = newEmail;
    await tutor.save();

    res.json({ success: true, message: "Email updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));


// ✅ Update profile picture
router.put('/:id/update-profile-picture', upload.single('profilePicture'), asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    
    const tutor = await Tutor.findById(id);
    if (!tutor) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Tutor not found" });
    }

    if (!req.file) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    // Delete previous profile picture if exists
    if (tutor.profilePicPublicId) {
      await cloudinary.uploader.destroy(tutor.profilePicPublicId);
    }

    // Upload new image to Cloudinary
    const uploadResult = await uploadToCloudinary(req.file.buffer);

    // Update tutor with new profile picture information
    tutor.profilePicture = uploadResult.secure_url;
    tutor.profilePicPublicId = uploadResult.public_id;
    
    await tutor.save({ session });
    
    await session.commitTransaction();
    session.endSession();

    res.json({ 
      success: true, 
      message: "Profile picture updated successfully", 
      data: { profilePicture: tutor.profilePicture } 
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: error.message });
  }
}));

// ✅ Confirm Pass password
router.put('/:id/confirm-pass', asyncHandler(async (req, res) => {
  try {
    const { password } = req.body;
    const { id } = req.params;

    const tutor = await Tutor.findById(id);
    if (!tutor) {
      return res.status(404).json({ success: false, message: "Tutor not found" });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(password, tutor.password);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, message: "Password is incorrect" });
    } else {
      return res.status(400).json({ success: true, message: "Password Verified" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));


// ✅ Update employee Salary
router.put('/:id/salary/:month/pay', asyncHandler(async (req, res) => {
  const { id, month } = req.params;
  const { amount, processedBy } = req.body;
  const currentYear = new Date().getFullYear();

  try {
    const tutor = await Tutor.findById(id);
    if (!tutor) {
      return res.status(404).json({ success: false, message: "Tutor not found" });
    }

    // Find the salary record for the given month & year
    const salaryRecord = tutor.salaryPayments.find(sal => sal.month === month && sal.year === currentYear);

    if (!salaryRecord) {
      return res.status(400).json({ success: false, message: "Salary record not found for this month" });
    }

    if (salaryRecord.status === "paid") {
      return res.status(400).json({ success: false, message: "Salary is already marked as paid" });
    }

    // Update the salary record
    salaryRecord.status = "paid";
    salaryRecord.paidAt = new Date();
    salaryRecord.amount = amount;
    salaryRecord.processedBy = processedBy;

    await tutor.save();
    res.json({ success: true, message: `Salary for ${month} marked as paid`, data: tutor });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));



// ✅ Delete a tutor
router.delete('/:id', asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    
    const tutor = await Tutor.findById(id);
    if (!tutor) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Tutor not found" });
    }

    // Delete profile picture from Cloudinary if exists
    if (tutor.profilePicPublicId) {
      await cloudinary.uploader.destroy(tutor.profilePicPublicId);
    }

    // Delete the tutor
    await Tutor.deleteOne({ _id: id }).session(session);
    
    await session.commitTransaction();
    session.endSession();

    res.json({ success: true, message: "Tutor deleted successfully" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: error.message });
  }
}));

module.exports = router;
