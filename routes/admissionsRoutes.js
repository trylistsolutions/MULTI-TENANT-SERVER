const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const bcrypt = require('bcrypt');
const asyncHandler = require('express-async-handler');
const Student = require('../models/Student');
const { transporter, generateStudentWelcomeTemplate } = require('../config/emailConfig');

// Multer memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.ZOEZI_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.ZOEZI_CLOUDINARY_API_KEY,
  api_secret: process.env.ZOEZI_CLOUDINARY_API_SECRET,
  secure: true
});

const uploadToCloudinary = (fileBuffer, folder = 'students_profile_pictures') => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        quality: 'auto:good',
        fetch_format: 'auto',
        width: 400,
        height: 400,
        crop: 'fill',
        gravity: 'face'
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    ).end(fileBuffer);
  });
};

// POST /api/admissions - manual student creation
router.post('/', upload.single('profilePicture'), asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      // Basic info
      firstName, lastName, email, phone, dateOfBirth, gender, citizenship, idNumber,
      // Admission info
      admissionNumber,
      // Education info
      qualification, course, trainingMode, preferredIntake, preferredStartDate, startDate, kcseGrade,
      // Course specific
      courseDuration,
      // Application history
      howHeardAbout, otherSource,
      // Finance
      courseFee, upfrontFee, feePayer, feePayerPhone,
      // Emergency contact
      nextOfKinName, nextOfKinRelationship, nextOfKinPhone
    } = req.body;

    // Basic validation
    if (!firstName || !lastName || !email || !phone || !course) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Check for existing student by email or phone
    const existing = await Student.findOne({ $or: [{ email }, { phone }] });
    if (existing) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: 'Email or phone already exists' });
    }

    let profileUrl = null;
    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer);
      profileUrl = uploadResult.secure_url;
    }

    const saltRounds = parseInt(process.env.ZOEZI_BCRYPT_SALT_ROUNDS || '10');
    const hashedPassword = await bcrypt.hash(phone, saltRounds);

    // Parse howHeardAbout array
    let howHeardAboutArray = [];
    if (howHeardAbout) {
      if (Array.isArray(howHeardAbout)) {
        howHeardAboutArray = howHeardAbout;
      } else {
        howHeardAboutArray = [howHeardAbout];
      }
    }

    // Parse exams array from form data
    let exams = [];

    if (Array.isArray(req.body.exams)) {
      exams = req.body.exams.map(e => ({
        name: e.name,
        score: Number(e.score) || 0
      }));
    }

    
    const student = new Student({
      // Basic info
      firstName,
      lastName,
      email,
      phone,
      password: hashedPassword,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      gender,
      citizenship,
      idNumber,

      // Admission info
      admissionNumber: admissionNumber || undefined,

      // Education info
      qualification,
      course,
      trainingMode,
      preferredIntake,
      preferredStartDate,
      startDate: startDate ? new Date(startDate) : undefined,
      kcseGrade,

      // Course specific
      courseDuration: courseDuration || undefined,
      exams: exams.length > 0 ? exams : undefined,

      // Application history
      howHeardAbout: howHeardAboutArray,
      otherSource,

      // Finance
      courseFee: courseFee ? Number(courseFee) : undefined,
      upfrontFee: upfrontFee ? Number(upfrontFee) : undefined,
      feePayer,
      feePayerPhone,

      // Emergency contact
      nextOfKinName,
      nextOfKinRelationship,
      nextOfKinPhone,

      // Media
      profilePicture: profileUrl
    });

    await student.save({ session });

    // Send welcome email using admission number
    try {
      const html = generateStudentWelcomeTemplate(
        `${student.firstName} ${student.lastName}`,
        student.admissionNumber || student._id.toString(),
        student.startDate || student.preferredStartDate || '',
        student.course,
        student.courseFee || '',
        student.upfrontFee || ''
      );
      await transporter.sendMail({
        from: process.env.ZOEZI_EMAIL,
        to: student.email,
        subject: `Welcome to Nairobi Zoezi School - ${student.admissionNumber || student._id}`,
        html
      });
    } catch (err) {
      console.error('Failed to send welcome email:', err);
      // continue; student already created
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      message: 'Student created successfully',
      data: {
        studentId: student._id,
        admissionNumber: student.admissionNumber
      }
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Admissions error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to create student',
      error: err.message
    });
  }
}));

module.exports = router;
