const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const asyncHandler = require('express-async-handler');
const Tutor = require('../models/Tutor');
const Course = require('../models/Course'); // Assuming you have a Course model
const bcrypt = require('bcrypt');

// Multer memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Cloudinary upload utility
const uploadToCloudinary = (fileBuffer, folder = 'tutors_profile_pictures') => {
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

// DELETE from Cloudinary utility
const deleteFromCloudinary = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    // Don't throw error - we don't want to fail the request if Cloudinary deletion fails
  }
};

// Utility function to sanitize tutor data (remove sensitive fields)
const sanitizeTutor = (tutor) => {
  if (!tutor) return null;
  
  const tutorObj = tutor.toObject ? tutor.toObject() : { ...tutor };
  
  // Remove sensitive fields
  delete tutorObj.password;
  
  return tutorObj;
};

// GET /tutors - Get all tutors with optional search and pagination
router.get('/', asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 50, sort = 'createdAt' } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  let query = {};
  
  // Search functionality
  if (search && search.trim() !== '') {
    query = {
      $or: [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { role: { $regex: search, $options: 'i' } }
      ]
    };
  }

  const [tutors, total] = await Promise.all([
    Tutor.find(query)
      .populate('courses', 'name code description')
      .select('-password') // Exclude password from results
      .sort({ [sort]: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Tutor.countDocuments(query)
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      tutors,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
}));

// GET /tutors/:id - Get single tutor by ID
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid tutor ID'
    });
  }

  const tutor = await Tutor.findById(id)
    .populate('courses', 'name code description duration fee')
    .select('-password'); // Exclude password

  if (!tutor) {
    return res.status(404).json({
      status: 'error',
      message: 'Tutor not found'
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      tutor: sanitizeTutor(tutor)
    }
  });
}));

// POST /tutors - Create new tutor
router.post('/', upload.single('profilePicture'), asyncHandler(async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      role,
      phone,
      email,
      kraPin,
      courses
    } = req.body;

    // Basic validation
    if (!firstName || !lastName || !email || !phone) {
      return res.status(400).json({
        status: 'error',
        message: 'First name, last name, email, and phone are required'
      });
    }

    // Check for existing tutor by email or phone
    const existingTutor = await Tutor.findOne({ 
      $or: [{ email }, { phone }] 
    });

    if (existingTutor) {
      return res.status(400).json({
        status: 'error',
        message: 'Tutor with this email or phone already exists'
      });
    }

    // Parse courses if provided
    let courseIds = [];
    if (courses) {
      try {
        courseIds = JSON.parse(courses);
        // Validate that all course IDs exist
        if (courseIds.length > 0) {
          const validCourses = await Course.find({ 
            _id: { $in: courseIds } 
          });
          
          if (validCourses.length !== courseIds.length) {
            return res.status(400).json({
              status: 'error',
              message: 'One or more course IDs are invalid'
            });
          }
        }
      } catch (parseError) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid courses format'
        });
      }
    }

    // Handle profile picture upload
    let profilePictureData = null;
    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.buffer);
        profilePictureData = {
          url: uploadResult.secure_url,
          cloudinaryId: uploadResult.public_id
        };
      } catch (uploadError) {
        return res.status(500).json({
          status: 'error',
          message: 'Failed to upload profile picture'
        });
      }
    }

    // Create tutor
    // Hash phone as initial password
    let hashedPassword = null;
    try {
      hashedPassword = await bcrypt.hash(phone.trim(), 10);
    } catch (err) {
      return res.status(500).json({ status: 'error', message: 'Failed to hash password' });
    }

    const tutor = new Tutor({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role: role?.trim() || 'Tutor',
      phone: phone.trim(),
      email: email.trim().toLowerCase(),
      kraPin: kraPin?.trim() || null,
      profilePicture: profilePictureData,
      courses: courseIds,
      password: hashedPassword
    });

    const savedTutor = await tutor.save();

    // If tutor was created with courses, ensure those Course documents reference this tutor
    if (courseIds.length > 0) {
      await Course.updateMany(
        { _id: { $in: courseIds } },
        { $addToSet: { tutors: savedTutor._id } }
      );
    }

    // Populate courses for response and exclude password
    await savedTutor.populate('courses', 'name code');
    const sanitizedTutor = sanitizeTutor(savedTutor);

    res.status(201).json({
      status: 'success',
      message: 'Tutor created successfully',
      data: {
        tutor: sanitizedTutor
      }
    });

  } catch (error) {
    console.error('Create tutor error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create tutor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

// PUT /tutors/:id - Update tutor
router.put('/:id', upload.single('profilePicture'), asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const {
      firstName,
      lastName,
      role,
      phone,
      email,
      kraPin,
      courses
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid tutor ID'
      });
    }

    // Find existing tutor
    const existingTutor = await Tutor.findById(id);
    if (!existingTutor) {
      return res.status(404).json({
        status: 'error',
        message: 'Tutor not found'
      });
    }

    // Check for duplicate email or phone (excluding current tutor)
    if (email && email !== existingTutor.email) {
      const emailExists = await Tutor.findOne({ 
        email: email.trim().toLowerCase(),
        _id: { $ne: id }
      });

      if (emailExists) {
        return res.status(400).json({
          status: 'error',
          message: 'Another tutor with this email already exists'
        });
      }
    }

    if (phone && phone !== existingTutor.phone) {
      const phoneExists = await Tutor.findOne({ 
        phone: phone.trim(),
        _id: { $ne: id }
      });

      if (phoneExists) {
        return res.status(400).json({
          status: 'error',
          message: 'Another tutor with this phone already exists'
        });
      }
    }

    // Parse courses if provided
    let courseIds = existingTutor.courses;
    if (courses !== undefined) {
      try {
        courseIds = JSON.parse(courses);
        // Validate that all course IDs exist
        if (courseIds.length > 0) {
          const validCourses = await Course.find({ 
            _id: { $in: courseIds } 
          });
          
          if (validCourses.length !== courseIds.length) {
            return res.status(400).json({
              status: 'error',
              message: 'One or more course IDs are invalid'
            });
          }
        }
      } catch (parseError) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid courses format'
        });
      }
    }

    // Handle profile picture upload
    let profilePictureData = { ...existingTutor.profilePicture };
    if (req.file) {
      try {
        // Delete old image if exists
        if (existingTutor.profilePicture.cloudinaryId) {
          await deleteFromCloudinary(existingTutor.profilePicture.cloudinaryId);
        }

        // Upload new image
        const uploadResult = await uploadToCloudinary(req.file.buffer);
        profilePictureData = {
          url: uploadResult.secure_url,
          cloudinaryId: uploadResult.public_id
        };
      } catch (uploadError) {
        return res.status(500).json({
          status: 'error',
          message: 'Failed to upload profile picture'
        });
      }
    }

    // Update tutor
    const updateData = {
      ...(firstName && { firstName: firstName.trim() }),
      ...(lastName && { lastName: lastName.trim() }),
      ...(role && { role: role.trim() }),
      ...(phone && { phone: phone.trim() }),
      ...(email && { email: email.trim().toLowerCase() }),
      ...(kraPin !== undefined && { kraPin: kraPin?.trim() || null }),
      profilePicture: profilePictureData,
      courses: courseIds
    };

    // If phone changed, update password to hashed new phone (initial password policy)
    if (phone && phone.trim() !== existingTutor.phone) {
      try {
        const newHashed = await bcrypt.hash(phone.trim(), 10);
        updateData.password = newHashed;
      } catch (err) {
        return res.status(500).json({ status: 'error', message: 'Failed to hash new password' });
      }
    }

    const updatedTutor = await Tutor.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('courses', 'name code')
     .select('-password'); // Exclude password

    // Keep Course.tutors in sync: add to newly assigned courses, remove from unassigned
    const prevCourseIds = (existingTutor.courses || []).map(c => String(c));
    const newCourseIds = (courseIds || []).map(c => String(c));

    const toAdd = newCourseIds.filter(cid => !prevCourseIds.includes(cid));
    const toRemove = prevCourseIds.filter(cid => !newCourseIds.includes(cid));

    if (toAdd.length > 0) {
      await Course.updateMany(
        { _id: { $in: toAdd } },
        { $addToSet: { tutors: existingTutor._id } }
      );
    }

    if (toRemove.length > 0) {
      await Course.updateMany(
        { _id: { $in: toRemove } },
        { $pull: { tutors: existingTutor._id } }
      );
    }

    res.status(200).json({
      status: 'success',
      message: 'Tutor updated successfully',
      data: {
        tutor: sanitizeTutor(updatedTutor)
      }
    });

  } catch (error) {
    console.error('Update tutor error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update tutor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

// DELETE /tutors/:id - Delete tutor
router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid tutor ID'
      });
    }

    const tutor = await Tutor.findById(id);
    if (!tutor) {
      return res.status(404).json({
        status: 'error',
        message: 'Tutor not found'
      });
    }

    // Delete profile picture from Cloudinary if exists
    if (tutor.profilePicture.cloudinaryId) {
      await deleteFromCloudinary(tutor.profilePicture.cloudinaryId);
    }

    // Delete tutor
    await Tutor.findByIdAndDelete(id);

    res.status(200).json({
      status: 'success',
      message: 'Tutor deleted successfully'
    });

  } catch (error) {
    console.error('Delete tutor error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete tutor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

// GET /tutors/:id/students - Get all students assigned to a tutor
router.get('/:id/students', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid tutor ID'
      });
    }

    const User = require('../models/User');
    const Alumni = require('../models/Alumni');

    // Find all students (User and Alumni) assigned to this tutor
    const [students, alumni] = await Promise.all([
      User.find(
        { 'courses.tutor.id': new mongoose.Types.ObjectId(id) },
        {
          _id: 1,
          firstName: 1,
          lastName: 1,
          email: 1,
          phone: 1,
          courses: 1,
          discussions: 1,
          userType: 1,
          profilePicture: 1
        }
      ).lean(),
      Alumni.find(
        { 'courses.tutor.id': new mongoose.Types.ObjectId(id) },
        {
          _id: 1,
          firstName: 1,
          lastName: 1,
          email: 1,
          phone: 1,
          courses: 1,
          discussions: 1,
          userType: 1,
          profilePicture: 1
        }
      ).lean()
    ]);

    // Remove courses that don't have this tutor assigned
    const removeUnassignedCourses = (student) => ({
      ...student,
      courses: student.courses?.filter(c => 
        c.tutor?.id && String(c.tutor.id) === String(id)
      ) || [],
      userType: student.userType || 'student'
    });

    const allStudents = [
      ...students.map(removeUnassignedCourses),
      ...alumni.map(removeUnassignedCourses)
    ].filter(s => s.courses.length > 0); // Only return students with courses assigned to this tutor

    res.status(200).json({
      status: 'success',
      message: 'Students fetched successfully',
      data: allStudents
    });

  } catch (error) {
    console.error('Get tutor students error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch students',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

module.exports = router;