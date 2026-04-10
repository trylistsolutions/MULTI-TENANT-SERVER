const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Alumni = require('../models/Alumni');
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

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

// GET /students - list students with optional pagination and search
router.get('/', async (req, res) => {
  try {
    const { limit = 50, skip = 0, search } = req.query;
    const q = {};
    if (search) {
      const re = new RegExp(search, 'i');
      q.$or = [{ firstName: re }, { lastName: re }, { email: re }, { phone: re }];
    }

    const total = await Student.countDocuments(q);
    const students = await Student.find(q)
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .sort({ createdAt: -1 })
      .select('-password'); // Return ALL fields except password

    res.status(200).json({ status: 'success', data: { students, pagination: { total, limit: parseInt(limit), skip: parseInt(skip) } } });
  } catch (err) {
    console.error('Get students error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch students', error: err.message });
  }
});

// PUT /students/:studentId/update-upfront-fee - Update student upfrontFee (paid amount)
router.put('/:studentId/update-upfront-fee', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { upfrontFee } = req.body;

    if (upfrontFee === undefined || isNaN(upfrontFee) || upfrontFee < 0) {
      return res.status(400).json({ status: 'error', message: 'Invalid upfront fee amount' });
    }

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ status: 'error', message: 'Student not found' });
    }

    // Ensure upfront fee does not exceed course fee
    if (parseFloat(upfrontFee) > (student.courseFee || 0)) {
      return res.status(400).json({ status: 'error', message: 'Upfront fee cannot exceed course fee' });
    }

    const updatedStudent = await Student.findByIdAndUpdate(
      studentId,
      { upfrontFee: parseFloat(upfrontFee) },
      { new: true }
    ).select('-password');

    res.status(200).json({ status: 'success', message: 'Upfront fee updated successfully', data: updatedStudent });
  } catch (err) {
    console.error('Update upfront fee error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to update upfront fee', error: err.message });
  }
});

// PUT /students/:studentId/update-exam-grades - Update exam grades for a student
router.put('/:studentId/update-exam-grades', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { examGrades } = req.body; // Array of { examIndex, score }

    if (!Array.isArray(examGrades) || examGrades.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Invalid exam grades data' });
    }

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ status: 'error', message: 'Student not found' });
    }

    // Update each exam grade
    examGrades.forEach((gradeItem) => {
      const { examIndex, score } = gradeItem;
      if (student.exams[examIndex]) {
        student.exams[examIndex].score = score;
      }
    });

    await student.save();

    res.status(200).json({ status: 'success', message: 'Exam grades updated successfully', data: student });
  } catch (err) {
    console.error('Update exam grades error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to update exam grades', error: err.message });
  }
});

// POST /students/:studentId/graduate - Graduate a student (transfer to Alumni, delete from Students)
router.post('/:studentId/graduate', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { studentId } = req.params;

    const student = await Student.findById(studentId).session(session);
    if (!student) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ status: 'error', message: 'Student not found' });
    }

    // Check fee completion
    if ((student.upfrontFee || 0) < (student.courseFee || 0)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ status: 'error', message: 'Student fees not fully paid' });
    }

    // Check all exams have grades
    if (!student.exams || student.exams.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ status: 'error', message: 'No exams found for student' });
    }

    const allGradesComplete = student.exams.every(exam => exam.score && exam.score !== null);
    if (!allGradesComplete) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ status: 'error', message: 'Not all exam grades are entered' });
    }

    // Create alumni record with all student data
    const alumniData = {
      firstName: student.firstName,
      lastName: student.lastName,
      email: student.email,
      phone: student.phone,
      password: student.password,
      dateOfBirth: student.dateOfBirth,
      gender: student.gender,
      admissionNumber: student.admissionNumber,
      applicationRef: student.applicationRef,
      qualification: student.qualification,
      course: student.course,
      trainingMode: student.trainingMode,
      preferredIntake: student.preferredIntake,
      preferredStartDate: student.preferredStartDate,
      startDate: student.startDate,
      citizenship: student.citizenship,
      idNumber: student.idNumber,
      kcseGrade: student.kcseGrade,
      howHeardAbout: student.howHeardAbout,
      otherSource: student.otherSource,
      courseFee: student.courseFee,
      upfrontFee: student.upfrontFee,
      feePayer: student.feePayer,
      feePayerPhone: student.feePayerPhone,
      nextOfKinName: student.nextOfKinName,
      nextOfKinRelationship: student.nextOfKinRelationship,
      nextOfKinPhone: student.nextOfKinPhone,
      courseDuration: student.courseDuration,
      exams: student.exams,
      profilePicture: student.profilePicture,
      status: 'alumni',
      graduationDate: new Date()
    };

    const alumnus = new Alumni(alumniData);
    await alumnus.save({ session });

    // Delete student from Students collection
    await Student.findByIdAndDelete(studentId, { session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      status: 'success',
      message: 'Student graduated successfully',
      data: { alumniId: alumnus._id, admissionNumber: alumnus.admissionNumber }
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Graduation error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to graduate student', error: err.message });
  }
});

// PUT /students/:studentId/update - Update student information by section
router.put('/:studentId/update', upload.single('file'), async (req, res) => {
  try {
    const { studentId } = req.params;
    const { section, data } = req.body;

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ status: 'error', message: 'Student not found' });
    }

    // Handle profile picture upload
    if (section === 'profile' && req.file) {
      // Delete old profile picture if exists
      if (student.profilePicPublicId) {
        try {
          await cloudinary.uploader.destroy(student.profilePicPublicId);
        } catch (deleteError) {
          console.error('Error deleting old profile image:', deleteError);
          // Continue with upload even if deletion fails
        }
      }

      // Upload new picture
      const imageData = await uploadToCloudinary(req.file.buffer);

      const updatedStudent = await Student.findByIdAndUpdate(
        studentId,
        {
          profilePicture: imageData.secure_url,
          profilePicPublicId: imageData.public_id
        },
        { new: true }
      ).select('-password');

      return res.status(200).json({
        status: 'success',
        message: 'Profile picture updated successfully',
        data: updatedStudent
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
      default:
        return res.status(400).json({ status: 'error', message: 'Invalid section' });
    }

    const updatedStudent = await Student.findByIdAndUpdate(
      studentId,
      updateData,
      { new: true }
    ).select('-password');

    res.status(200).json({
      status: 'success',
      message: `${section} information updated successfully`,
      data: updatedStudent
    });
  } catch (err) {
    console.error('Update student error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to update student', error: err.message });
  }
});

// GET /students/dashboard/stats - Get comprehensive dashboard statistics
router.get('/dashboard/stats', async (req, res) => {
  try {
    const Application = require('../models/Application');

    // Count applications by status
    const applicationStats = await Application.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalApplications = await Application.countDocuments();
    const pendingApps = await Application.countDocuments({ status: 'pending' });
    const acceptedApps = await Application.countDocuments({ status: 'accepted' });
    const rejectedApps = await Application.countDocuments({ status: 'rejected' });

    // Student statistics
    const totalStudents = await Student.countDocuments();
    const totalFeeCollected = await Student.aggregate([
      { $group: { _id: null, total: { $sum: '$upfrontFee' } } }
    ]);

    const feeCollected = totalFeeCollected.length > 0 ? totalFeeCollected[0].total : 0;

    // Course breakdown
    const courseStats = await Student.aggregate([
      {
        $group: {
          _id: '$course',
          count: { $sum: 1 },
          totalFee: { $sum: '$courseFee' },
          totalPaid: { $sum: '$upfrontFee' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Gender breakdown
    const genderStats = await Student.aggregate([
      {
        $group: {
          _id: '$gender',
          count: { $sum: 1 }
        }
      }
    ]);

    // Training mode breakdown
    const trainingModeStats = await Student.aggregate([
      {
        $group: {
          _id: '$trainingMode',
          count: { $sum: 1 }
        }
      }
    ]);

    // Alumni statistics
    const Alumni = require('../models/Alumni');
    const totalAlumni = await Alumni.countDocuments();

    // Fee completion percentage
    const studentsWithAllFees = await Student.countDocuments({
      $expr: { $gte: ['$upfrontFee', '$courseFee'] }
    });
    const feeCompletionPercent = totalStudents > 0 ? Math.round((studentsWithAllFees / totalStudents) * 100) : 0;

    res.status(200).json({
      status: 'success',
      data: {
        applications: {
          total: totalApplications,
          pending: pendingApps,
          accepted: acceptedApps,
          rejected: rejectedApps
        },
        students: {
          total: totalStudents,
          feeCollected,
          feeCompletionPercent,
          byGender: genderStats,
          byTrainingMode: trainingModeStats,
          byCourse: courseStats
        },
        alumni: {
          total: totalAlumni
        },
        conversionRate: totalApplications > 0 ? Math.round((acceptedApps / totalApplications) * 100) : 0
      }
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch dashboard stats', error: err.message });
  }
});

// GET /students/public/all - Get all public profiles (students + alumni)
router.get('/public/all', async (req, res) => {
  try {
    // Fetch all students with public profile enabled
    const students = await Student.find({ 
      isPublicProfileEnabled: true 
    })
      .select('-password')
      .sort({ firstName: 1 })
      .lean();

    // Fetch all alumni with public profile enabled
    const Alumni = require('../models/Alumni');
    const alumni = await Alumni.find({ 
      isPublicProfileEnabled: true,
      // Uncomment if you want subscription check
      // 'subscription.active': true,
      // 'subscription.expiryDate': { $gte: new Date() }
    })
      .select('-password')
      .sort({ firstName: 1 })
      .lean();

    // Combine profiles
    const allProfiles = [...students, ...alumni]
      .sort((a, b) => {
        // Alumni first, then students
        if (a.status === 'alumni' && b.status !== 'alumni') return -1;
        if (a.status !== 'alumni' && b.status === 'alumni') return 1;
        // Then sort by firstName alphabetically
        if (a.firstName < b.firstName) return -1;
        if (a.firstName > b.firstName) return 1;
        return 0;
      });

    res.status(200).json({
      status: 'success',
      data: {
        profiles: allProfiles,
        total: allProfiles.length
      }
    });
  } catch (err) {
    console.error('Public profiles error:', err);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to fetch public profiles', 
      error: err.message 
    });
  }
});

// GET /students/public/search - Enhanced search with fuzzy matching
router.get('/public/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    // If no query, return all public profiles
    if (!q || q.trim() === '') {
      // Fetch all students with public profile enabled
      const students = await Student.find({ 
        isPublicProfileEnabled: true 
      })
        .select('-password')
        .sort({ firstName: 1 })
        .lean();

      // Fetch all alumni with public profile enabled
      const Alumni = require('../models/Alumni');
      const alumni = await Alumni.find({ 
        isPublicProfileEnabled: true
      })
        .select('-password')
        .sort({ firstName: 1 })
        .lean();

      const allProfiles = [...students, ...alumni]
        .sort((a, b) => {
          if (a.status === 'alumni' && b.status !== 'alumni') return -1;
          if (a.status !== 'alumni' && b.status === 'alumni') return 1;
          if (a.firstName < b.firstName) return -1;
          if (a.firstName > b.firstName) return 1;
          return 0;
        });

      return res.status(200).json({
        status: 'success',
        data: {
          results: allProfiles,
          count: allProfiles.length
        }
      });
    }

    // Process search query
    const processedQuery = preprocessSearchQuery(q);
    
    // Create search conditions
    const searchConditions = [];
    const Alumni = require('../models/Alumni');

    // 1. Exact matches (highest priority)
    searchConditions.push(
      {
        $or: [
          { firstName: { $regex: `^${processedQuery.exact}$`, $options: 'i' } },
          { lastName: { $regex: `^${processedQuery.exact}$`, $options: 'i' } },
          { email: { $regex: `^${processedQuery.exact}$`, $options: 'i' } },
          { phone: { $regex: `^${processedQuery.cleanPhone}$`, $options: 'i' } },
          { admissionNumber: { $regex: `^${processedQuery.exact}$`, $options: 'i' } }
        ]
      }
    );

    // 2. Partial word matches (second priority)
    if (processedQuery.words.length > 0) {
      const wordConditions = [];
      
      // For each word, search across all fields
      processedQuery.words.forEach(word => {
        if (word.length >= 2) { // Only search for words with 2+ characters
          const wordRegex = new RegExp(word, 'i');
          wordConditions.push({
            $or: [
              { firstName: wordRegex },
              { lastName: wordRegex },
              { admissionNumber: wordRegex },
              { email: wordRegex },
              { phone: { $regex: `.*${word}.*`, $options: 'i' } }
            ]
          });
        }
      });

      if (wordConditions.length > 0) {
        searchConditions.push({ $and: wordConditions });
      }
    }

    // 3. Combined name search (if query contains space)
    if (processedQuery.words.length >= 2) {
      const firstName = processedQuery.words[0];
      const lastName = processedQuery.words.slice(1).join(' ');
      
      searchConditions.push({
        $and: [
          { firstName: { $regex: firstName, $options: 'i' } },
          { lastName: { $regex: lastName, $options: 'i' } }
        ]
      });

      // Also try reverse (last name first)
      searchConditions.push({
        $and: [
          { firstName: { $regex: processedQuery.words.slice(-1)[0], $options: 'i' } },
          { lastName: { $regex: processedQuery.words.slice(0, -1).join(' '), $options: 'i' } }
        ]
      });
    }

    // 4. Fuzzy/partial matches (lowest priority)
    searchConditions.push({
      $or: [
        { firstName: { $regex: `.*${processedQuery.exact}.*`, $options: 'i' } },
        { lastName: { $regex: `.*${processedQuery.exact}.*`, $options: 'i' } },
        { email: { $regex: `.*${processedQuery.exact}.*`, $options: 'i' } },
        { admissionNumber: { $regex: `.*${processedQuery.exact}.*`, $options: 'i' } }
      ]
    });

    // Search students
    const studentQuery = {
      isPublicProfileEnabled: true,
      $or: searchConditions
    };

    const students = await Student.find(studentQuery)
      .select('-password')
      .lean();

    // Search alumni
    const alumniQuery = {
      isPublicProfileEnabled: true,
      $or: searchConditions
    };

    const alumni = await Alumni.find(alumniQuery)
      .select('-password')
      .lean();

    // Combine results
    let allResults = [...students, ...alumni];

    // Score and sort results
    const scoredResults = allResults.map(profile => ({
      profile,
      score: calculateRelevanceScore(profile, processedQuery)
    }));

    // Sort by score (highest first)
    scoredResults.sort((a, b) => b.score - a.score);

    // Extract profiles
    const results = scoredResults.map(item => item.profile);

    res.status(200).json({
      status: 'success',
      data: {
        results,
        count: results.length
      }
    });
  } catch (err) {
    console.error('Public search error:', err);
    res.status(500).json({ 
      status: 'error', 
      message: 'Search failed', 
      error: err.message 
    });
  }
});

// Helper function to preprocess search query
function preprocessSearchQuery(query) {
  if (!query) return { exact: '', words: [], cleanPhone: '' };
  
  // Convert to string and trim
  const strQuery = String(query).trim();
  
  // Remove special characters except spaces and dots
  const cleanQuery = strQuery
    .replace(/[^\w\s@.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Extract words
  const words = cleanQuery.split(/\s+/).filter(word => word.length > 0);
  
  // Clean phone number (remove all non-numeric)
  const cleanPhone = strQuery.replace(/\D/g, '');
  
  return {
    exact: cleanQuery,
    words: words,
    original: strQuery,
    cleanPhone: cleanPhone
  };
}

// Helper function to calculate relevance score
function calculateRelevanceScore(profile, query) {
  let score = 0;
  const fullName = `${profile.firstName} ${profile.lastName}`.toLowerCase();
  const queryLower = query.original.toLowerCase();
  
  // Exact matches get highest scores
  if (profile.firstName.toLowerCase() === query.exact.toLowerCase()) score += 100;
  if (profile.lastName.toLowerCase() === query.exact.toLowerCase()) score += 100;
  if (fullName === query.original.toLowerCase()) score += 150;
  if (profile.email.toLowerCase() === query.exact.toLowerCase()) score += 120;
  if (profile.admissionNumber === query.exact) score += 110;
  
  // Phone number exact match (with cleaned numbers)
  const profilePhoneClean = (profile.phone || '').replace(/\D/g, '');
  if (profilePhoneClean === query.cleanPhone && query.cleanPhone.length >= 7) {
    score += 130;
  }
  
  // Starts with matches
  if (profile.firstName.toLowerCase().startsWith(query.words[0]?.toLowerCase() || '')) score += 40;
  if (profile.lastName.toLowerCase().startsWith(query.words[0]?.toLowerCase() || '')) score += 40;
  
  // Contains matches
  if (fullName.includes(queryLower)) score += 60;
  if (profile.firstName.toLowerCase().includes(queryLower)) score += 50;
  if (profile.lastName.toLowerCase().includes(queryLower)) score += 50;
  if ((profile.email || '').toLowerCase().includes(queryLower)) score += 45;
  if ((profile.admissionNumber || '').toLowerCase().includes(queryLower)) score += 55;
  
  // Word-by-word matching
  query.words.forEach(word => {
    if (profile.firstName.toLowerCase().includes(word.toLowerCase())) score += 20;
    if (profile.lastName.toLowerCase().includes(word.toLowerCase())) score += 20;
  });
  
  // Boost for verified/alumni profiles
  if (profile.verified) score += 10;
  if (profile.status === 'alumni') score += 15;
  
  return score;
}

// Additional endpoint for autocomplete suggestions
router.get('/public/autocomplete', async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(200).json({
        status: 'success',
        data: { suggestions: [] }
      });
    }
    
    const processedQuery = preprocessSearchQuery(q);
    const Alumni = require('../models/Alumni');
    
    // Search across multiple fields for suggestions
    const studentSuggestions = await Student.find({
      isPublicProfileEnabled: true,
      $or: [
        { firstName: { $regex: `^${processedQuery.exact}.*`, $options: 'i' } },
        { lastName: { $regex: `^${processedQuery.exact}.*`, $options: 'i' } },
        { email: { $regex: `^${processedQuery.exact}.*`, $options: 'i' } },
        { admissionNumber: { $regex: `^${processedQuery.exact}.*`, $options: 'i' } }
      ]
    })
      .select('firstName lastName email admissionNumber status')
      .limit(parseInt(limit))
      .lean();
    
    const alumniSuggestions = await Alumni.find({
      isPublicProfileEnabled: true,
      $or: [
        { firstName: { $regex: `^${processedQuery.exact}.*`, $options: 'i' } },
        { lastName: { $regex: `^${processedQuery.exact}.*`, $options: 'i' } },
        { email: { $regex: `^${processedQuery.exact}.*`, $options: 'i' } },
        { admissionNumber: { $regex: `^${processedQuery.exact}.*`, $options: 'i' } }
      ]
    })
      .select('firstName lastName email admissionNumber status')
      .limit(parseInt(limit))
      .lean();
    
    const allSuggestions = [...studentSuggestions, ...alumniSuggestions];
    
    // Format suggestions
    const suggestions = allSuggestions.map(profile => ({
      name: `${profile.firstName} ${profile.lastName}`,
      email: profile.email,
      admissionNumber: profile.admissionNumber,
      type: profile.status === 'alumni' ? 'Alumni' : 'Student',
      display: `${profile.firstName} ${profile.lastName} (${profile.admissionNumber || profile.email})`
    }));
    
    // Remove duplicates based on email
    const uniqueSuggestions = suggestions.filter((suggestion, index, self) =>
      index === self.findIndex(s => s.email === suggestion.email)
    );
    
    res.status(200).json({
      status: 'success',
      data: { suggestions: uniqueSuggestions.slice(0, parseInt(limit)) }
    });
    
  } catch (err) {
    console.error('Autocomplete error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Autocomplete failed',
      error: err.message
    });
  }
});

// PUT /students/:studentId/public-profile - Update student's public profile info (verified, practiceStatus, currentLocation, etc.)
router.put('/:studentId/public-profile', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { practiceStatus, currentLocation, practicingSince, isPublicProfileEnabled } = req.body;

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ status: 'error', message: 'Student not found' });
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

    const updatedStudent = await Student.findByIdAndUpdate(
      studentId,
      updateData,
      { new: true }
    ).select('-password');

    res.status(200).json({
      status: 'success',
      message: 'Public profile updated successfully',
      data: updatedStudent
    });
  } catch (err) {
    console.error('Update public profile error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to update public profile', error: err.message });
  }
});






// In your studentRoutes.js or similar

// Record payment (both manual and M-PESA)
router.post('/:id/record-payment', async (req, res) => {
    try {
        const studentId = req.params.id;
        const { 
            amount, 
            paymentMethod, 
            recordedBy, 
            notes,
            transactionType,
            transactionId,
            phone,
            checkoutRequestId,
            operation = 'add' // 'add' or 'deduct'
        } = req.body;

        const student = await Student.findById(studentId);
        if (!student) {
            return res.status(404).json({
                status: 'error',
                message: 'Student not found'
            });
        }

        // Create payment record
        const paymentRecord = {
            amount: parseFloat(amount),
            paymentMethod,
            recordedBy,
            notes,
            transactionType: transactionType || 'manual',
            status: 'complete',
            operation,
            createdAt: new Date()
        };

        // Add M-PESA specific fields if present
        if (transactionType === 'mpesa') {
            paymentRecord.transactionId = transactionId;
            paymentRecord.phone = phone;
            paymentRecord.checkoutRequestId = checkoutRequestId;
        }

        // Initialize paymentHistory array if it doesn't exist
        if (!student.paymentHistory) {
            student.paymentHistory = [];
        }

        // Add payment record to history
        student.paymentHistory.push(paymentRecord);

        // Update upfront fee based on operation
        const currentUpfront = student.upfrontFee || 0;
        if (operation === 'add') {
            student.upfrontFee = currentUpfront + parseFloat(amount);
        } else if (operation === 'deduct') {
            student.upfrontFee = Math.max(0, currentUpfront - parseFloat(amount));
        }

        await student.save();

        res.status(200).json({
            status: 'success',
            message: 'Payment recorded successfully',
            data: {
                student,
                paymentRecord
            }
        });
    } catch (error) {
        console.error('Record payment error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to record payment'
        });
    }
});

// Get payment history
router.get('/:id/payment-history', async (req, res) => {
    try {
        const studentId = req.params.id;
        const student = await Student.findById(studentId)
            .select('paymentHistory');

        if (!student) {
            return res.status(404).json({
                status: 'error',
                message: 'Student not found'
            });
        }

        res.status(200).json({
            status: 'success',
            data: student.paymentHistory || []
        });
    } catch (error) {
        console.error('Get payment history error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch payment history'
        });
    }
});

module.exports = router;
