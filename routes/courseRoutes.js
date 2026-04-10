const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const asyncHandler = require('express-async-handler');
const Course = require('../models/Course');
const Tutor = require('../models/Tutor');

// Multer configuration
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 5 // Maximum 5 files (1 cover + 4 secondary)
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Cloudinary configuration
const uploadToCloudinary = (fileBuffer, folder = 'courses_images') => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        quality: 'auto:good',
        fetch_format: 'auto',
        width: 800,
        height: 450,
        crop: 'fill'
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    ).end(fileBuffer);
  });
};

// Delete from Cloudinary
const deleteFromCloudinary = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
  }
};

// GET /courses - Get all courses with optional search, courseType, and pagination
router.get('/', asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 50, status, courseType } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  let query = { isArchived: false };
  
  // Search functionality
  if (search && search.trim() !== '') {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  // Status filter
  if (status && ['active', 'inactive'].includes(status)) {
    query.status = status;
  }

  // Course type filter
  if (courseType) {
    query.courseType = courseType;
  }

  const [courses, total] = await Promise.all([
    Course.find(query)
      .select('-isArchived')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Course.countDocuments(query)
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      courses,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
}));

// GET /courses/:id - Get single course by ID
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid course ID'
    });
  }

  const course = await Course.findOne({ _id: id, isArchived: false })
    .populate('tutors', 'firstName lastName email profilePicture');

  if (!course) {
    return res.status(404).json({
      status: 'error',
      message: 'Course not found'
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      course: course.getProfile()
    }
  });
}));

// POST /courses - Create new course
router.post(
  '/',
  upload.fields([
    { name: 'coverImage', maxCount: 1 },
    { name: 'secondaryImages', maxCount: 4 }
  ]),
  asyncHandler(async (req, res) => {
    try {
      const {
        name,
        description,
        courseType,
        courseTier,
        duration,
        durationType,
        courseFee,
        offerPrice,
        status,
        certificationAvailable
      } = req.body;

      if (!name || !duration || !courseFee) {
        return res.status(400).json({
          status: 'error',
          message: 'Name, duration, and course fee required'
        });
      }

      // Upload cover image
      let coverImageData = null;
      if (req.files?.coverImage?.[0]) {
        const uploadResult = await uploadToCloudinary(
          req.files.coverImage[0].buffer,
          'courses_cover'
        );
        coverImageData = {
          url: uploadResult.secure_url,
          cloudinaryId: uploadResult.public_id
        };
      }

      // Upload secondary images
      let secondaryImagesData = [];
      if (req.files?.secondaryImages) {
        for (let i = 0; i < req.files.secondaryImages.length; i++) {
          const file = req.files.secondaryImages[i];
          const uploadResult = await uploadToCloudinary(
            file.buffer,
            'courses_secondary'
          );

          secondaryImagesData.push({
            url: uploadResult.secure_url,
            cloudinaryId: uploadResult.public_id,
            order: i
          });
        }
      }

      const course = new Course({
        name: name.trim(),
        description,
        courseType,
        courseTier,
        duration,
        durationType,
        courseFee,
        offerPrice: offerPrice || null,
        status: status || 'active',
        certificationAvailable: certificationAvailable === 'true' || certificationAvailable === true,
        coverImage: coverImageData,
        secondaryImages: secondaryImagesData
      });

      const savedCourse = await course.save();

      res.status(201).json({
        status: 'success',
        message: 'Course created',
        data: savedCourse
      });
    } catch (error) {
      console.error('Create course error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to create course'
      });
    }
  })
);

// PUT /courses/:id - Update course
router.put(
  '/:id',
  upload.fields([
    { name: 'coverImage', maxCount: 1 },
    { name: 'secondaryImages', maxCount: 4 }
  ]),
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;

      const course = await Course.findById(id);
      if (!course) {
        return res.status(404).json({
          status: 'error',
          message: 'Course not found'
        });
      }

      // Upload new cover
      if (req.files?.coverImage?.[0]) {
        if (course.coverImage?.cloudinaryId)
          await deleteFromCloudinary(course.coverImage.cloudinaryId);

        const uploadResult = await uploadToCloudinary(
          req.files.coverImage[0].buffer,
          'courses_cover'
        );

        course.coverImage = {
          url: uploadResult.secure_url,
          cloudinaryId: uploadResult.public_id
        };
      }

      // Upload new secondary images
      if (req.files?.secondaryImages) {
        // Delete old ones
        for (const img of course.secondaryImages) {
          await deleteFromCloudinary(img.cloudinaryId);
        }

        const arr = [];
        for (let i = 0; i < req.files.secondaryImages.length; i++) {
          const file = req.files.secondaryImages[i];
          const uploadResult = await uploadToCloudinary(
            file.buffer,
            'courses_secondary'
          );
          arr.push({
            url: uploadResult.secure_url,
            cloudinaryId: uploadResult.public_id,
            order: i
          });
        }
        course.secondaryImages = arr;
      }

      // Normal field updates
      const updateData = { ...req.body };
      if (updateData.certificationAvailable !== undefined) {
        updateData.certificationAvailable =
          updateData.certificationAvailable === 'true' || updateData.certificationAvailable === true;
      }
      Object.assign(course, updateData);

      const updated = await course.save();

      res.json({
        status: 'success',
        message: 'Course updated',
        data: updated
      });
    } catch (error) {
      console.error('Update error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to update course'
      });
    }
  })
);

// DELETE /courses/:id - Delete course (soft delete/archive)
router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        status: 'error',
        message: 'Course not found'
      });
    }

    // Delete images
    if (course.coverImage?.cloudinaryId) {
      await deleteFromCloudinary(course.coverImage.cloudinaryId);
    }

    for (const img of course.secondaryImages) {
      await deleteFromCloudinary(img.cloudinaryId);
    }

    // Soft delete
    course.isArchived = true;
    course.status = 'inactive';
    await course.save();

    res.json({
      status: 'success',
      message: 'Course deleted'
    });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete course'
    });
  }
}));


// PATCH /courses/:id/certification - Toggle certification availability
router.patch('/:id/certification', asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) {
    return res.status(404).json({ status: 'error', message: 'Course not found' });
  }
  course.certificationAvailable = !course.certificationAvailable;
  await course.save();
  res.json({
    status: 'success',
    message: `Certification ${course.certificationAvailable ? 'enabled' : 'disabled'}`,
    data: { certificationAvailable: course.certificationAvailable }
  });
}));

module.exports = router;

// POST /courses/:id/assign-tutors - Atomically assign/unassign tutors for a course
router.post('/:id/assign-tutors', asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    let { tutorIds } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ status: 'error', message: 'Invalid course ID' });
    }

    if (!tutorIds) tutorIds = [];
    if (typeof tutorIds === 'string') {
      try { tutorIds = JSON.parse(tutorIds); } catch (e) { /* keep as is */ }
    }

    if (!Array.isArray(tutorIds)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ status: 'error', message: 'tutorIds must be an array' });
    }

    // Validate tutor IDs
    const allValid = tutorIds.every(tid => mongoose.Types.ObjectId.isValid(tid));
    if (!allValid) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ status: 'error', message: 'One or more tutor IDs are invalid' });
    }

    const course = await Course.findById(id).session(session);
    if (!course) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ status: 'error', message: 'Course not found' });
    }

    // Ensure all tutor ids exist
    const validTutors = await Tutor.find({ _id: { $in: tutorIds } }).session(session);
    if (validTutors.length !== tutorIds.length) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ status: 'error', message: 'One or more tutor IDs do not exist' });
    }

    // Current assigned tutors
    const previousTutorIds = (course.tutors || []).map(t => String(t));

    // Set course tutors to new list
    course.tutors = tutorIds;
    await course.save({ session });

    // Determine which tutors to add/remove
    const toAdd = tutorIds.filter(tid => !previousTutorIds.includes(String(tid)));
    const toRemove = previousTutorIds.filter(tid => !tutorIds.includes(tid));

    // Add course to newly assigned tutors
    if (toAdd.length > 0) {
      await Tutor.updateMany(
        { _id: { $in: toAdd } },
        { $addToSet: { courses: course._id } },
        { session }
      );
    }

    // Remove course from unassigned tutors
    if (toRemove.length > 0) {
      await Tutor.updateMany(
        { _id: { $in: toRemove } },
        { $pull: { courses: course._id } },
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    // Return updated course (lean if getProfile not available)
    const updatedCourse = await Course.findById(id).lean();

    return res.status(200).json({
      status: 'success',
      message: 'Course tutors updated successfully',
      data: { course: updatedCourse }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Assign tutors error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to update course tutors', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
}));