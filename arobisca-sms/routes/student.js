const express = require('express');
const asyncHandler = require('express-async-handler');
const bcrypt = require('bcrypt');
const router = express.Router();
const mongoose = require('mongoose');
const Student = require('../models/student');
const Tutor = require('../models/tutors');
const Course = require('../models/courses');
const Group = require('../models/group');
const Exam = require('../models/exam');
const multer = require('multer');
const Alumni = require('../models/alumni');
const cloudinary = require('cloudinary').v2;

// Get all students
router.get('/', asyncHandler(async (req, res) => {
  try {
    const users = await Student.find()
      .populate('groupId', 'groupName timeSlot startTime endTime tutorId tutorName')
      .populate('tutorId', 'firstName lastName');

    res.json({
      success: true,
      message: "Students retrieved successfully.",
      data: users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}));

// Get students by tutor ID
router.get('/tutorStudents/:tutorId', asyncHandler(async (req, res) => {
  try {
    const { tutorId } = req.params;

    const students = await Student.find({
      tutorId: tutorId,
      allotment: "assigned"
    })
      .populate('groupId', 'groupName timeSlot startTime endTime tutorId tutorName')
      .populate('tutorId', 'firstName lastName');

    res.json({
      success: true,
      message: "Students retrieved successfully.",
      data: students
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}));

// Get student's assigned exams with full exam details and responses if submitted
router.get('/:admissionNumber/assigned-exams', asyncHandler(async (req, res) => {
  try {
    const { admissionNumber } = req.params;

    let student = await Student.findOne({ admissionNumber })
      .populate({
        path: 'assignedExams.exam',
        model: 'Exam'
      });

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // Sync assigned exams from group if student joined after exams were assigned
    if (student.groupId) {
      const group = await Group.findById(student.groupId);
      if (group && Array.isArray(group.exams) && group.exams.length > 0) {
        const getExamId = (value) => {
          if (!value) return null;
          return value._id ? value._id : value;
        };

        let updated = false;
        const deduped = [];
        const seen = new Map();
        (student.assignedExams || []).forEach(entry => {
          const examId = getExamId(entry.exam);
          if (!examId) return;
          const key = String(examId);

          if (!seen.has(key)) {
            seen.set(key, entry);
            deduped.push(entry);
            return;
          }

          const existing = seen.get(key);
          if (!existing.submitted && entry.submitted) {
            const idx = deduped.indexOf(existing);
            if (idx >= 0) deduped[idx] = entry;
            seen.set(key, entry);
          }
          updated = true;
        });

        if (updated) {
          student.assignedExams = deduped;
        }

        const existingMap = new Map(
          (student.assignedExams || []).map(entry => {
            const examId = getExamId(entry.exam);
            return examId ? [String(examId), entry] : null;
          }).filter(Boolean)
        );
        group.exams.forEach(groupExam => {
          const examId = groupExam.exam && groupExam.exam._id ? groupExam.exam._id : groupExam.exam;
          if (!examId) return;
          const existing = existingMap.get(String(examId));

          if (!existing) {
            student.assignedExams.push({
              groupId: student.groupId,
              exam: examId,
              examName: groupExam.examName,
              examSchemeName: groupExam.examSchemeName,
              examSchemeWeight: groupExam.examSchemeWeight,
              startDate: groupExam.startDate,
              endDate: groupExam.endDate,
              status: groupExam.status,
              submitted: false,
              submittedAt: null
            });
            updated = true;
          } else {
            const shouldUpdate =
              existing.examName !== groupExam.examName ||
              existing.examSchemeName !== groupExam.examSchemeName ||
              Number(existing.examSchemeWeight || 0) !== Number(groupExam.examSchemeWeight || 0) ||
              String(existing.startDate || '') !== String(groupExam.startDate || '') ||
              String(existing.endDate || '') !== String(groupExam.endDate || '') ||
              existing.status !== groupExam.status;

            if (shouldUpdate) {
              existing.examName = groupExam.examName;
              existing.examSchemeName = groupExam.examSchemeName;
              existing.examSchemeWeight = groupExam.examSchemeWeight;
              existing.startDate = groupExam.startDate;
              existing.endDate = groupExam.endDate;
              existing.status = groupExam.status;
              updated = true;
            }
          }
        });

        if (updated) {
          await student.save();
          student = await Student.findOne({ admissionNumber })
            .populate({
              path: 'assignedExams.exam',
              model: 'Exam'
            });
        }
      }
    }

    // Ensure tutor-answered exams have response placeholders for marking
    let tutorResponseAdded = false;
    (student.assignedExams || []).forEach(entry => {
      const examDoc = entry?.exam;
      if (!examDoc || examDoc.answerMode !== 'tutor') return;

      const hasResponse = (student.examResponses || []).some(r => {
        const examId = r.exam && r.exam._id ? r.exam._id : r.exam;
        return String(examId) === String(examDoc._id);
      });

      if (!hasResponse) {
        const answers = (examDoc.questions || []).map(q => ({
          questionId: q.questionId,
          response: '',
          marksAwarded: 0
        }));

        student.examResponses.push({
          exam: examDoc._id,
          groupId: student.groupId,
          answers,
          totalScore: 0,
          appliedScore: 0,
          isAutoMarked: false,
          finalized: false
        });
        tutorResponseAdded = true;
      }
    });

    if (tutorResponseAdded) {
      await student.save();
      student = await Student.findOne({ admissionNumber })
        .populate({
          path: 'assignedExams.exam',
          model: 'Exam'
        });
    }

    // Enrich with current status (upcoming/active/closed) based on current date
    const now = new Date();
    const enrichedAssignedExams = (student.assignedExams || []).map(assignment => {
      const obj = assignment.toObject ? assignment.toObject() : assignment;
      const examDoc = obj.exam;
      
      // Find corresponding response if exam is submitted
      let response = null;
      if (student.examResponses && student.examResponses.length > 0) {
        const shouldAttach = obj.submitted || examDoc?.answerMode === 'tutor';
        if (shouldAttach) {
          response = student.examResponses.find(r => r.exam && r.exam.equals ? r.exam.equals(obj.exam._id) : r.exam === obj.exam._id);
        }
      }
      
      return {
        ...obj,
        status: obj.startDate && obj.endDate
          ? (now < obj.startDate ? 'upcoming' : (now > obj.endDate ? 'closed' : 'active'))
          : obj.status,
        response: response || null
      };
    });

    res.json({
      success: true,
      data: enrichedAssignedExams
    });
  } catch (error) {
    console.error('Error fetching assigned exams:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}));

// Get pending exam counts for a group (manual marking queue helper)
router.get('/group/:groupId/pending-exams', asyncHandler(async (req, res) => {
  try {
    const { groupId } = req.params;
    const students = await Student.find({ groupId }).select('firstName lastName admissionNumber assignedExams examResponses');

    const data = students.map(student => {
      const pendingAssigned = (student.assignedExams || []).filter(a => !a.submitted).length;
      const pendingReviews = (student.examResponses || []).filter(r => !r.finalized).length;
      const pendingCount = pendingAssigned + pendingReviews;

      return {
        studentId: student._id,
        admissionNumber: student.admissionNumber,
        firstName: student.firstName,
        lastName: student.lastName,
        pendingCount
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching pending exam counts:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}));

// Submit exam responses
router.post('/:admissionNumber/submit-exam', asyncHandler(async (req, res) => {
  try {
    const { admissionNumber } = req.params;
    const { examId, answers } = req.body;

    const student = await Student.findOne({ admissionNumber });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    const existingResponse = (student.examResponses || []).some(r => String(r.exam) === String(examId));
    if (existingResponse) {
      return res.status(400).json({ success: false, message: 'Exam already submitted' });
    }

    const exam = await Exam.findById(examId);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    if (exam.answerMode === 'tutor') {
      return res.status(400).json({
        success: false,
        message: 'This exam is assessed by the tutor. No student submission is required.'
      });
    }

    // Validate exam time - Check if student's assigned exam has expired
    const assignedExam = student.assignedExams.find(a => String(a.exam) === String(examId));
    if (assignedExam && assignedExam.endDate) {
      const now = new Date();
      const endDate = new Date(assignedExam.endDate);
      if (now > endDate) {
        return res.status(400).json({
          success: false,
          message: 'Exam time has expired. Submissions are no longer accepted.'
        });
      }
    }

    // Fetch course to get exam scheme weights
    const courseDoc = await Course.findById(student.course);
    if (!courseDoc) return res.status(404).json({ success: false, message: 'Course not found' });

    // Check if exam is purely multiple-choice
    const questions = exam.questions || [];
    const isPureMCQ = questions.length > 0 && questions.every(q => q.type === 'multipleChoice');

    // Helper function to normalize strings for matching
    const normalize = (str) => (str || '').trim().toLowerCase();

    // Score marking logic
    let partialScore = 0;
    let mcqScore = 0;
    let hasNonMCQ = false;

    const answersStored = (answers || []).map((a, ansIdx) => {
      let question = null;
      if (a.questionId) {
        question = questions.find(q => String(q.questionId) === String(a.questionId));
      }
      const idx = question ? questions.indexOf(question) : ansIdx;
      if (!question) question = questions[idx];

      let marksAwarded = 0;

      if (question) {
        if (question.type === 'multipleChoice') {
          // Get correct choices
          const correctChoices = (question.choices || [])
            .filter(c => c.isCorrect)
            .map(c => (c.text || '').trim());

          const resp = a.response;
          const numCorrectChoices = correctChoices.length;

          if (Array.isArray(resp)) {
            // Multi-select MCQ
            const normalizedResp = resp.map(r => (r || '').trim());
            const numSelected = normalizedResp.length;
            const numCorrectlySelected = normalizedResp.filter(r => correctChoices.includes(r)).length;

            // Partial marks: full marks only if all correct, partial if some correct
            if (numCorrectlySelected > 0) {
              marksAwarded = Math.round((numCorrectlySelected / numCorrectChoices) * question.marks);
            }
          } else if (typeof resp === 'string') {
            // Single-select MCQ
            const normalizedResp = (resp || '').trim();
            if (correctChoices.length === 1 && normalizedResp === correctChoices[0]) {
              marksAwarded = question.marks;
            } else if (correctChoices.length > 1 && correctChoices.includes(normalizedResp)) {
              // Single choice but exam has multiple correct - award half marks
              marksAwarded = Math.round(question.marks / 2);
            }
          }
          mcqScore += marksAwarded;
        } else {
          // Non-MCQ question (essay, matching, etc.)
          hasNonMCQ = true;
        }
      }

      return {
        questionId: question ? question.questionId : (a.questionId || null),
        response: a.response,
        marksAwarded
      };
    });

    partialScore = mcqScore;

    const responseEntry = {
      exam: examId,
      groupId: student.groupId,
      answers: answersStored,
      totalScore: partialScore,
      appliedScore: 0,
      isAutoMarked: isPureMCQ,
      finalized: isPureMCQ
    };

    student.examResponses.push(responseEntry);

    // Mark assigned exam as submitted
    const assignedIdx = student.assignedExams.findIndex(a => a.exam.toString() === examId);
    let examSchemeName = null;
    if (assignedIdx >= 0) {
      if (student.assignedExams[assignedIdx].submitted) {
        return res.status(400).json({ success: false, message: 'Exam already submitted' });
      }
      examSchemeName = student.assignedExams[assignedIdx].examSchemeName;
      student.assignedExams[assignedIdx].submitted = true;
      student.assignedExams[assignedIdx].submittedAt = new Date();
    }

    // Only update student exam scores if this is a pure MCQ exam
    if (isPureMCQ && examSchemeName) {
      // Find the corresponding exam scheme in the course
      const schemeNameNorm = normalize(examSchemeName);
      const matchedScheme = courseDoc.examScheme.find(s => normalize(s.name) === schemeNameNorm);

      if (matchedScheme) {
        // Find or create the exam entry in student.exams
        const existingExamIdx = student.exams.findIndex(e => normalize(e.name) === schemeNameNorm);

        const previousApplied = responseEntry.appliedScore || 0;
        const delta = partialScore - previousApplied;
        responseEntry.appliedScore = partialScore;

        if (existingExamIdx >= 0) {
          student.exams[existingExamIdx].score = (student.exams[existingExamIdx].score || 0) + delta;
        } else {
          student.exams.push({
            name: matchedScheme.name,
            weight: matchedScheme.weight,
            score: partialScore
          });
        }
      }
    }

    await student.save();

    res.json({
      success: true,
      message: isPureMCQ 
        ? 'Exam auto-marked successfully' 
        : 'Exam submitted for manual marking',
      data: {
        score: partialScore,
        isAutoMarked: isPureMCQ,
        response: responseEntry
      }
    });
  } catch (error) {
    console.error('Error submitting exam:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}));

// Configure multer storage (temporary)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Cloudinary Config
cloudinary.config({
  cloud_name: process.env.AROBISCA_SMS_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.AROBISCA_SMS_CLOUDINARY_API_KEY,
  api_secret: process.env.AROBISCA_SMS_CLOUDINARY_API_SECRET,
  secure: true
});

// Upload to Cloudinary function
const uploadToCloudinary = (fileBuffer) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder: "profile_pictures",
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

// Register new student
router.post('/register', upload.single('profileImage'), asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
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

    let {
      academicYear, course, admissionNumber, admissionDate, upfrontFee,
      firstName, lastName, gender, dateOfBirth, religion, nationality,
      email, phoneNumber, nationalId, emergencyFirstName, emergencyLastName,
      emergencyRelation, emergencyPhone, startDate,
    } = req.body;

    const courseDoc = await Course.findById(course).session(session);
    if (!courseDoc) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Course not found" });
    }

    courseDoc.enrolledStudents = (courseDoc.enrolledStudents || 0) + 1;
    await courseDoc.save({ session });

    // Validate required fields
    const requiredFields = ['course', 'admissionNumber', 'firstName', 'lastName', 'gender',
      'dateOfBirth', 'email', 'phoneNumber', 'nationalId',
      'emergencyFirstName', 'emergencyLastName', 'emergencyRelation', 'emergencyPhone', 'startDate'];

    for (const field of requiredFields) {
      if (!req.body[field]) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ error: `${field} is required` });
      }
    }

    // Default values
    academicYear = academicYear || new Date().getFullYear().toString();
    admissionDate = admissionDate || new Date().toISOString().split('T')[0];
    religion = religion || "Other";
    nationality = nationality || "Kenyan";

    // Hash phone number for password
    const hashedPassword = await bcrypt.hash(phoneNumber, 10);

    // Check for duplicate student - one field at a time
    const duplicateCheck = await Student.findOne({
      $or: [
        { admissionNumber },
        { email },
        { nationalId }
      ]
    }).session(session);

    if (duplicateCheck) {
      await session.abortTransaction();
      session.endSession();

      if (duplicateCheck.admissionNumber === admissionNumber) {
        return res.status(400).json({ error: "Admission Number already exists in the records", details: duplicateCheck });
      }
      if (duplicateCheck.email === email) {
        return res.status(400).json({ error: "Email already exists in the records", details: duplicateCheck });
      }
      if (duplicateCheck.nationalId === nationalId) {
        return res.status(400).json({ error: "National ID already exists in the records", details: duplicateCheck });
      }
    }


    const studentData = {
      academicYear,
      course,
      courseName: courseDoc.name,
      admissionNumber,
      admissionDate,
      upfrontFee: parseInt(upfrontFee, 10) || 0,
      feeUpdates: [{
        amount: parseInt(upfrontFee, 10) || 0,
        previousAmount: 0,
        changeType: "initial",
        timestamp: new Date(),
        note: "Initial registration fee"
      }],
      firstName,
      lastName,
      allotment: 'pending',
      isCertificateReady: false,
      tutorId: '',
      tutorName: '',
      assignedCohort: '',
      gender,
      dateOfBirth,
      startDate,
      religion,
      nationality,
      email,
      phoneNumber,
      nationalId,
      password: hashedPassword,
      emergencyContact: {
        firstName: emergencyFirstName,
        lastName: emergencyLastName,
        relation: emergencyRelation,
        phone: emergencyPhone
      },
      courseFee: courseDoc.fee,
      courseDuration: courseDoc.duration,
      profileImage: profileImageUrl,
      profilePicPublicId,
      exams: courseDoc.examScheme.map(exam => ({
        name: exam.name,
        weight: exam.weight,
        score: 0
      }))
    };


    const newStudent = await Student.create([studentData], { session });
    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: 'Student registered successfully',
      student: newStudent[0],
      course: courseDoc
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}));

// Get student by admission number
router.get('/:admissionNumber', asyncHandler(async (req, res) => {
  try {
    const admissionNumber = decodeURIComponent(req.params.admissionNumber); // Decode it
    const student = await Student.findOne({ admissionNumber });

    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    res.json({ success: true, data: student });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error", error });
  }
}));

// Update student
router.put('/:admissionNumber/update', upload.single('profileImage'), asyncHandler(async (req, res) => {
  const { admissionNumber } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Find the student
    const student = await Student.findOne({ admissionNumber }).session(session);

    if (!student) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    // Check if a new profile image was uploaded
    let profileImageUrl = student.profileImage;
    let profilePicPublicId = student.profilePicPublicId;

    if (req.file) {
      try {
        // Delete existing profile image from Cloudinary if it exists
        if (student.profilePicPublicId) {
          await cloudinary.uploader.destroy(student.profilePicPublicId);
        }

        // Upload new image
        const uploadResult = await uploadToCloudinary(req.file.buffer);
        profileImageUrl = uploadResult.secure_url;
        profilePicPublicId = uploadResult.public_id;
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
        return res.status(500).json({ success: false, message: "Profile image upload failed", details: error });
      }
    }

    // Process other fields
    const updateFields = {};
    const allowedFields = [
      'academicYear', 'course', 'admissionDate', 'upfrontFee',
      'firstName', 'lastName', 'gender', 'dateOfBirth', 'religion', 'nationality',
      'email', 'phoneNumber', 'nationalId', 'startDate',
      'emergencyFirstName', 'emergencyLastName', 'emergencyRelation', 'emergencyPhone'
    ];

    // Only update fields that are provided in the request
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        // Handle emergency contact fields separately
        if (field.startsWith('emergency')) {
          if (!updateFields.emergencyContact) {
            updateFields.emergencyContact = {};
          }
          const contactField = field.replace('emergency', '').charAt(0).toLowerCase() + field.replace('emergency', '').slice(1);
          updateFields.emergencyContact[contactField] = req.body[field];
        } else {
          updateFields[field] = req.body[field];
        }
      }
    }

    // Add profile image fields if there was an update
    if (req.file) {
      updateFields.profileImage = profileImageUrl;
      updateFields.profilePicPublicId = profilePicPublicId;
    }

    // If course is being updated, update course information
    if (req.body.course && req.body.course !== student.course.toString()) {
      // Find the new course
      const newCourse = await Course.findById(req.body.course).session(session);
      if (!newCourse) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ success: false, message: "New course not found" });
      }

      // Update course-related fields
      updateFields.courseName = newCourse.name;
      updateFields.courseFee = newCourse.fee;
      updateFields.courseDuration = newCourse.duration;

      // Update the enrolled students count in both courses
      // Decrement count in old course
      const oldCourse = await Course.findById(student.course).session(session);
      if (oldCourse) {
        oldCourse.enrolledStudents = Math.max(0, (oldCourse.enrolledStudents || 1) - 1);
        await oldCourse.save({ session });
      }

      // Increment count in new course
      newCourse.enrolledStudents = (newCourse.enrolledStudents || 0) + 1;
      await newCourse.save({ session });

      // Update exams based on new course
      updateFields.exams = newCourse.examScheme.map(exam => ({
        name: exam.name,
        weight: exam.weight,
        score: 0
      }));
    }

    // Update the student document
    const updatedStudent = await Student.findOneAndUpdate(
      { admissionNumber },
      { $set: updateFields },
      { new: true, session }
    );

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: "Student updated successfully",
      data: updatedStudent
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Update student error:", error);
    res.status(500).json({ success: false, message: "Internal server error", details: error.message });
  }
}));

// Update student fee
router.put('/:id/fee', asyncHandler(async (req, res) => {

  try {
    const { id } = req.params;
    const { upfrontFee } = req.body;

    // Validate new fee
    if (!upfrontFee || isNaN(upfrontFee) || upfrontFee < 0) {
      return res.status(400).json({ success: false, message: "Invalid fee amount" });
    }

    // Find student by ID
    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    // Update fee
    student.upfrontFee = upfrontFee;
    await student.save();

    res.json({ success: true, message: "Fee updated successfully", data: student });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));

// Cancel student admission
router.post('/:id/cancel-admission', asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;

    // Step 1: Find the student
    const student = await Student.findById(id).session(session);
    if (!student) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    // Step 2: Deduct student count from tutor (if any)
    if (student.tutorId) {
      const studentTutor = await Tutor.findById(student.tutorId).session(session);
      if (studentTutor) {
        studentTutor.studentCount = Math.max(0, (studentTutor.studentCount || 0) - 1);
        await studentTutor.save({ session });
      }
    }

    // Step 3: Remove student's profile picture if uploaded
    if (student.profilePicPublicId) {
      await cloudinary.uploader.destroy(student.profilePicPublicId);
    }

    // Step 4: Delete the student
    await Student.deleteOne({ _id: id }).session(session);

    // Step 5: Deduct count from course enrolled students
    if (student.course) {
      const course = await Course.findById(student.course).session(session);
      if (course) {
        course.enrolledStudents = Math.max(0, (course.enrolledStudents || 0) - 1);
        await course.save({ session });
      }
    }

    await session.commitTransaction();
    session.endSession();
    res.json({ success: true, message: "Admission cancelled successfully" });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: "Failed to cancel admission", error });
  }
}));

//----------- Update student grades
router.put("/:studentId/grades", async (req, res) => {
  try {
    const { studentId } = req.params
    const { exams } = req.body // Exams array with updated scores

    if (!Array.isArray(exams) || exams.length === 0) {
      return res.status(400).json({ success: false, message: "Invalid exams data" })
    }

    // Find student
    const student = await Student.findById(studentId)
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" })
    }

    // Update student exam scores
    student.exams = student.exams.map((exam) => {
      const updatedExam = exams.find((e) => String(e._id) === String(exam._id))
      return updatedExam ? { ...exam.toObject(), score: updatedExam.score } : exam
    })

    // Save student
    await student.save()

    res.json({ success: true, message: "Grades updated successfully" })
  } catch (error) {
    console.error("Error updating grades:", error)
    res.status(500).json({ success: false, message: "Internal Server Error" })
  }
})

// Toggle Certificate
router.put('/:id/certificate', asyncHandler(async (req, res) => {
  try {
    const studentId = req.params.id;
    const { isCertificateReady } = req.body;

    // Find the admin
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: "Student Not Found" });
    }

    // Toggle the isBlockedAccess field
    const updatedStudent = await Student.findByIdAndUpdate(
      studentId,
      { $set: { isCertificateReady: isCertificateReady } },
      { new: true }
    );


    res.json({
      success: true,
      message: `Certificate set ready to collect`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));

// Tutor marks an individual student exam response (manual grading)
router.put('/:studentId/examResponses/:responseId/mark', asyncHandler(async (req, res) => {
  try {
    const { studentId, responseId } = req.params;
    const { marks, remarks } = req.body; // marks: [{ questionId, marksAwarded }], remarks: [{ questionId, response }]
    const tutorId = req.headers.tutorid || null;

    if (!Array.isArray(marks)) return res.status(400).json({ success: false, message: 'Invalid marks payload' });

    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    const respIdx = student.examResponses.findIndex(r => String(r._id) === String(responseId));
    if (respIdx === -1) return res.status(404).json({ success: false, message: 'Response not found' });

    const response = student.examResponses[respIdx];

    const examDoc = await Exam.findById(response.exam);
    const isTutorAnswer = examDoc && examDoc.answerMode === 'tutor';
    const remarkMap = new Map(
      (Array.isArray(remarks) ? remarks : []).map(r => [String(r.questionId), r.response || ''])
    );

    if ((!response.answers || response.answers.length === 0) && examDoc && Array.isArray(examDoc.questions)) {
      response.answers = examDoc.questions.map(q => ({
        questionId: q.questionId,
        response: '',
        marksAwarded: 0
      }));
    }

    // Apply marks to answers and calculate total
    let totalScore = 0;
    response.answers = response.answers.map(ans => {
      const m = marks.find(mm => String(mm.questionId) === String(ans.questionId));
      const awarded = m && typeof m.marksAwarded === 'number' ? m.marksAwarded : (ans.marksAwarded || 0);
      totalScore += awarded;
      const next = { ...ans, marksAwarded: awarded };
      if (isTutorAnswer && remarkMap.has(String(ans.questionId))) {
        next.response = remarkMap.get(String(ans.questionId));
      }
      return next;
    });

    const previousApplied = typeof response.appliedScore === 'number' ? response.appliedScore : (response.totalScore || 0);
    const deltaScore = totalScore - previousApplied;
    response.totalScore = totalScore;
    response.appliedScore = totalScore;
    response.isAutoMarked = false;
    response.markedBy = tutorId;
    response.markedAt = new Date();
    response.finalized = true;

    const assignedEntry = student.assignedExams.find(a => String(a.exam) === String(response.exam));
    if (assignedEntry) {
      assignedEntry.submitted = true;
      assignedEntry.submittedAt = new Date();
    }

    // Update student exam scores by finding the exam scheme
    const assigned = student.assignedExams.find(a => String(a.exam) === String(response.exam));
    let assignedSchemeName = assigned ? assigned.examSchemeName : null;

    // Get course and find the official scheme info
    const courseDoc = await Course.findById(student.course);
    if (courseDoc && assignedSchemeName && Array.isArray(courseDoc.examScheme)) {
      const normalize = (str) => (str || '').trim().toLowerCase();
      const schemeNameNorm = normalize(assignedSchemeName);
      const matchedScheme = courseDoc.examScheme.find(s => normalize(s.name) === schemeNameNorm);

      if (matchedScheme) {
        // Find or create exam entry in student.exams
        const existingExamIdx = student.exams.findIndex(e => normalize(e.name) === schemeNameNorm);

        if (existingExamIdx >= 0) {
          student.exams[existingExamIdx].score = (student.exams[existingExamIdx].score || 0) + deltaScore;
        } else {
          student.exams.push({
            name: matchedScheme.name,
            weight: matchedScheme.weight,
            score: totalScore
          });
        }
      }
    }

    // Save student
    await student.save();

    res.json({ success: true, message: 'Marks saved and student exam score updated', data: response });
  } catch (error) {
    console.error('Error marking response:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}));

// Graduate a student (transfer to alumni)
router.post('/:studentId/graduate', asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { studentId } = req.params;

    // Find the student
    const student = await Student.findById(studentId).session(session);
    
    if (!student) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    // Find and update the current tutor (to deduct 1 from their student count)
    const studentTutor = await Tutor.findById(student.tutorId).session(session);
    if (studentTutor) {
      studentTutor.studentCount = Math.max(0, (studentTutor.studentCount || 0) - 1);
      await studentTutor.save({ session });
    }

    // Update course enrolled count
    const course = await Course.findById(student.course).session(session);
    if (course) {
      course.enrolledStudents = Math.max(0, (course.enrolledStudents || 1) - 1);
      await course.save({ session });
    }

    // Remove student from their group AND update group capacity if exists
    if (student.groupId) {
      // First, find the group
      const group = await Group.findById(student.groupId).session(session);
      
      if (group) {
        // Remove student from group's students array
        group.students = group.students.filter(
          s => s._id.toString() !== student._id.toString()
        );
        
        // Decrease current capacity (but never go below 0)
        group.currentCapacity = Math.max(0, (group.currentCapacity || 1) - 1);
        
        await group.save({ session });
        
        console.log(`Student removed from group: ${group.groupName}. New capacity: ${group.currentCapacity}`);
      }
    }

    // Delete profile image from Cloudinary if it exists
    if (student.profilePicPublicId) {
      try {
        await cloudinary.uploader.destroy(student.profilePicPublicId);
        console.log(`Cloudinary image deleted for student: ${student.admissionNumber}`);
      } catch (cloudinaryError) {
        console.error("Error deleting Cloudinary image:", cloudinaryError);
        // Continue with graduation even if image deletion fails
      }
    }

    // Create alumni record with selected fields
    const alumniData = {
      academicYear: student.academicYear,
      courseName: student.courseName,
      admissionNumber: student.admissionNumber,
      admissionDate: student.admissionDate,
      upfrontFee: student.upfrontFee,
      firstName: student.firstName,
      lastName: student.lastName,
      gender: student.gender,
      dateOfBirth: student.dateOfBirth,
      religion: student.religion,
      nationality: student.nationality,
      email: student.email,
      phoneNumber: student.phoneNumber,
      nationalId: student.nationalId,
      courseFee: student.courseFee,
      exams: student.exams,
      graduationDate: new Date(),
      isCertificateReady: student.isCertificateReady,
      tutorName: student.tutorName
    };

    // Create new alumni record
    const newAlumni = new Alumni(alumniData);
    await newAlumni.save({ session });

    // Delete the student record
    await Student.deleteOne({ _id: studentId }).session(session);

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: "Student successfully graduated and moved to alumni",
      data: newAlumni
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error graduating student:", error);
    res.status(500).json({
      success: false,
      message: "Failed to graduate student",
      error: error.message
    });
  }
}));

// ✅ Change password
router.put('/change-password', asyncHandler(async (req, res) => {
  try {
    const { admissionNumber, currentPassword, newPassword } = req.body;

    const student = await Student.findOne({ admissionNumber })
    if (!student) {
      return res.status(404).json({ success: false, message: "Your Information was Not Found In the records" });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, student.password);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, message: "Current password is incorrect" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    student.password = hashedPassword;
    await student.save();

    res.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));

// ✅ Update profile picture
router.put('/change-student-profile', upload.single('profileImage'), asyncHandler(async (req, res) => {
  try {
    const { admissionNumber } = req.body;

    const student = await Student.findOne({ admissionNumber })

    if (!student) {
      return res.status(404).json({ success: false, message: "Your Information was Not Found In the records" });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    // Delete previous profile picture if exists
    if (student.profilePicPublicId) {
      await cloudinary.uploader.destroy(student.profilePicPublicId);
    }

    // Upload new image to Cloudinary
    const uploadResult = await uploadToCloudinary(req.file.buffer);

    // Update tutor with new profile picture information
    student.profileImage = uploadResult.secure_url;
    student.profilePicPublicId = uploadResult.public_id;

    await student.save();

    res.json({
      success: true,
      message: "Profile picture updated successfully",
      data: { profileImage: student.profileImage }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));

// Get all alumni
router.get('/', asyncHandler(async (req, res) => {
  try {
    const alumni = await Alumni.find();
    res.json({ success: true, count: alumni.length, data: alumni });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch alumni records",
      error: error.message
    });
  }
}));

// Get alumni by admission number
router.get('/admission/:admissionNumber', asyncHandler(async (req, res) => {
  try {
    const admissionNumber = decodeURIComponent(req.params.admissionNumber);
    const alumni = await Alumni.findOne({ admissionNumber });

    if (!alumni) {
      return res.status(404).json({ success: false, message: "Alumni not found" });
    }

    res.json({ success: true, data: alumni });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch alumni record",
      error: error.message
    });
  }
}));

// Get alumni by ID
router.get('/:id', asyncHandler(async (req, res) => {
  try {
    const alumni = await Alumni.findById(req.params.id);

    if (!alumni) {
      return res.status(404).json({ success: false, message: "Alumni not found" });
    }

    res.json({ success: true, data: alumni });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch alumni record",
      error: error.message
    });
  }
}));

// Update alumni data
router.put('/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Remove fields that shouldn't be updated directly
    const fieldsToRemove = ['_id', '__v', 'createdAt', 'updatedAt', 'admissionNumber'];
    fieldsToRemove.forEach(field => delete updateData[field]);

    const alumni = await Alumni.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!alumni) {
      return res.status(404).json({ success: false, message: "Alumni not found" });
    }

    res.json({ success: true, message: "Alumni record updated", data: alumni });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update alumni record",
      error: error.message
    });
  }
}));

// Delete alumni record
router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const alumni = await Alumni.findByIdAndDelete(req.params.id);

    if (!alumni) {
      return res.status(404).json({ success: false, message: "Alumni not found" });
    }

    res.json({ success: true, message: "Alumni record deleted successfully" });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete alumni record",
      error: error.message
    });
  }
}));

module.exports = router;
