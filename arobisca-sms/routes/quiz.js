const express = require('express');
const router = express.Router();
const Quiz = require('../models/quiz');
const Group = require('../models/group');
const Student = require('../models/student');
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const updateQuizStatuses = require('../middleware/updateQuizStatuses');

// ✅ Middleware - runs before every request in this router
router.use(asyncHandler(async (req, res, next) => {
  await updateQuizStatuses();
  next();
}));

// Get all quizzes for a tutor
router.get('/', asyncHandler(async (req, res) => {
  try {
    const tutorId = req.headers.tutorid;

    const quizzes = await Quiz.find({ tutorId })
      .sort({ createdAt: -1 })
      .populate('responses.studentId', 'name admissionNumber course')
      .populate('groupId', 'groupName');

    res.json({
      success: true,
      message: 'Quizzes fetched successfully',
      data: quizzes
    });
  } catch (error) {
    console.error('Error fetching quizzes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quizzes',
      error: error.message
    });
  }
}));


// Replace the courses route with groups route
router.get('/groups', asyncHandler(async (req, res) => {
  try {
    const tutorId = req.headers.tutorid;

    const groups = await Group.find({
      tutorId: tutorId,
      status: 'active'
    }).select('groupName timeSlot');

    res.json({
      success: true,
      message: 'Groups fetched successfully',
      data: groups
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch groups',
      error: error.message
    });
  }
}));

// Update the create quiz route
router.post('/', asyncHandler(async (req, res) => {
  try {
    const { title, question, groupId, weight, startDate, endDate, additionalNotes } = req.body;
    const tutorId = req.headers.tutorid;
    const tutorName = req.headers.name;


    // Validate required fields
    if (!title || !question || !groupId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start >= end) {
      return res.status(400).json({
        success: false,
        message: 'End date must be after start date'
      });
    }

    // Check if group exists and belongs to tutor
    const group = await Group.findOne({
      _id: groupId,
      tutorId: tutorId
    });

    if (!group) {
      return res.status(400).json({
        success: false,
        message: 'Group not found or does not belong to you'
      });
    }

    // Check if group has students
    if (group.students.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'This group has no students assigned'
      });
    }

    const quiz = new Quiz({
      title,
      question,
      groupId,
      tutorId,
      tutorName,
      weight,
      startDate: start,
      endDate: end,
      additionalNotes: additionalNotes || '',
      status: start <= new Date() ? 'active' : 'draft'
    });

    await quiz.save();

    res.status(201).json({
      success: true,
      message: 'Quiz created successfully',
      data: quiz
    });
  } catch (error) {
    console.error('Error creating quiz:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create quiz',
      error: error.message
    });
  }
}));

// Update quiz
router.put('/:id', asyncHandler(async (req, res) => {
  try {
    const quizId = req.params.id;
    const tutorId = req.headers.tutorid;
    const { title, question, course, weight, startDate, endDate, additionalNotes, groupId } = req.body;

    const quiz = await Quiz.findOne({ _id: quizId, tutorId });

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found'
      });
    }

    // Check if quiz has responses - if yes, only allow certain updates
    if (quiz.responses.length > 0) {
      // Only allow updates to end date and additional notes if there are responses
      if (endDate) {
        const newEndDate = new Date(endDate);
        if (newEndDate < new Date()) {
          return res.status(400).json({
            success: false,
            message: 'Cannot set end date in the past when students have already responded'
          });
        }
        quiz.endDate = newEndDate;
      }

      if (additionalNotes !== undefined) {
        quiz.additionalNotes = additionalNotes;
      }
    } else {
      // No responses yet, allow full update
      if (title) quiz.title = title;
      if (groupId) quiz.groupId = groupId;
      if (question) quiz.question = question;
      if (weight) quiz.weight = weight;
      if (course) quiz.course = course;
      if (startDate) quiz.startDate = new Date(startDate);
      if (endDate) quiz.endDate = new Date(endDate);
      if (additionalNotes !== undefined) quiz.additionalNotes = additionalNotes;

      // Validate dates
      if (quiz.startDate >= quiz.endDate) {
        return res.status(400).json({
          success: false,
          message: 'End date must be after start date'
        });
      }
    }

    await quiz.save();

    res.json({
      success: true,
      message: 'Quiz updated successfully',
      data: quiz
    });
  } catch (error) {
    console.error('Error updating quiz:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update quiz',
      error: error.message
    });
  }
}));

// Delete quiz
router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const quizId = req.params.id;
    const tutorId = req.headers.tutorid;

    const quiz = await Quiz.findOneAndDelete({ _id: quizId, tutorId });

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found'
      });
    }

    res.json({
      success: true,
      message: 'Quiz deleted successfully',
      data: quiz
    });
  } catch (error) {
    console.error('Error deleting quiz:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete quiz',
      error: error.message
    });
  }
}));

// Get single quiz with responses
router.get('/:id', asyncHandler(async (req, res) => {
  try {
    const quizId = req.params.id;
    const tutorId = req.headers.tutorid;

    const quiz = await Quiz.findOne({ _id: quizId, tutorId })
      .populate('responses.studentId', 'name admissionNumber course');

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found'
      });
    }

    res.json({
      success: true,
      message: 'Quiz fetched successfully',
      data: quiz
    });
  } catch (error) {
    console.error('Error fetching quiz:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quiz',
      error: error.message
    });
  }
}));

// ADD THIS NEW ROUTE FOR GRADING A RESPONSE
router.put('/:quizId/responses/:responseId/grade', async (req, res) => {
  try {
    const { quizId, responseId } = req.params;
    const { grade, feedback } = req.body;

    if (grade === undefined) {
      return res.status(400).json({ success: false, message: 'Grade is required.' });
    }

    // Find the quiz and update the specific response
    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({ success: false, message: 'Quiz not found' });
    }

    const responseToUpdate = quiz.responses.id(responseId);
    if (!responseToUpdate) {
      return res.status(404).json({ success: false, message: 'Response not found' });
    }

    responseToUpdate.grade = grade;
    responseToUpdate.feedback = feedback;

    await quiz.save();
    res.status(200).json({ success: true, message: 'Grade updated successfully', data: responseToUpdate });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// New route to fetch quizzes for a specific student (by groupId)
router.get('/student/single', asyncHandler(async (req, res) => {
  try {
    const studentId = req.headers.studentid;
    const groupId = req.headers.groupid;

    if (!studentId || !groupId) {
      return res.status(400).json({
        success: false,
        message: 'Both studentId and groupId are required in headers.'
      });
    }

    const student = await Student.findById(studentId).select('firstName lastName admissionNumber courseName');
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    // Find quizzes for the given group, sorted by end date
    const quizzes = await Quiz.find({ groupId }).sort({ endDate: 1 });

    // Map quizzes, attaching the student's response if exists
    // in /student/single route
    const quizzesWithStudentData = quizzes.map(quiz => {
      const studentResponse = quiz.responses.find(r => r.studentId.toString() === studentId);

      return {
        _id: quiz._id,
        title: quiz.title,
        question: quiz.question,
        additionalNotes: quiz.additionalNotes,
        startDate: quiz.startDate,
        endDate: quiz.endDate,
        weight: quiz.weight,
        status: (() => {
          const now = new Date();
          if (now < quiz.startDate) return 'draft';
          if (now > quiz.endDate) return 'expired';
          return 'active';
        })(),
        response: studentResponse ? {
          answer: studentResponse.answer,
          grade: studentResponse.grade,
          feedback: studentResponse.feedback,
          submittedAt: studentResponse.submittedAt
        } : null,
      };
    });

    res.json({ success: true, data: quizzesWithStudentData });


    res.json({
      success: true,
      message: 'Quizzes fetched successfully for student group',
      data: quizzesWithStudentData
    });

  } catch (error) {
    console.error('Error fetching student quizzes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quizzes for student.',
      error: error.message
    });
  }
}));



// New route for students to submit a response to a quiz
router.post('/:quizId/submit-response', asyncHandler(async (req, res) => {
  try {
    const { quizId } = req.params;
    const { studentId, studentName, admissionNumber, course, answer } = req.body;

    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({ success: false, message: 'Quiz not found' });
    }

    // Check if the quiz is expired
    if (quiz.isExpired) {
      return res.status(400).json({ success: false, message: 'This quiz has expired and cannot accept new responses.' });
    }

    // Check if the student has already submitted a response
    const existingResponse = quiz.responses.find(response => response.studentId.toString() === studentId);
    if (existingResponse) {
      return res.status(400).json({ success: false, message: 'You have already responded to this quiz.' });
    }

    // Create a new response object
    const newResponse = {
      studentId,
      studentName,
      admissionNumber,
      course,
      answer
    };

    quiz.responses.push(newResponse);
    await quiz.save();

    res.status(201).json({ success: true, message: 'Quiz response submitted successfully.', data: newResponse });

  } catch (error) {
    console.error('Error submitting quiz response:', error);
    res.status(500).json({ success: false, message: 'Failed to submit quiz response.', error: error.message });
  }
}));

module.exports = router;