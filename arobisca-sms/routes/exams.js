const express = require('express');
const router = express.Router();
const Exam = require('../models/exam');
const Course = require('../models/courses');
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');

// Get all exams for a tutor
router.get('/', asyncHandler(async (req, res) => {
  try {
    const tutorId = req.headers.tutorid;

    const exams = await Exam.find({ tutorId })
      .sort({ createdAt: -1 })
      .populate('courseId', 'name');

    res.json({
      success: true,
      message: 'Exams fetched successfully',
      data: exams
    });
  } catch (error) {
    console.error('Error fetching exams:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch exams',
      error: error.message
    });
  }
}));

// Get exam by ID
router.get('/:examId', asyncHandler(async (req, res) => {
  try {
    const { examId } = req.params;
    const tutorId = req.headers.tutorid;

    if (!mongoose.Types.ObjectId.isValid(examId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid exam ID'
      });
    }

    const exam = await Exam.findOne({
      _id: examId,
      tutorId: tutorId
    }).populate('courseId', 'name');

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    res.json({
      success: true,
      message: 'Exam fetched successfully',
      data: exam
    });
  } catch (error) {
    console.error('Error fetching exam:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch exam',
      error: error.message
    });
  }
}));

// Get exams by course ID
router.get('/course/:courseId', asyncHandler(async (req, res) => {
  try {
    const { courseId } = req.params;
    const tutorId = req.headers.tutorid;

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid course ID'
      });
    }

    const exams = await Exam.find({
      courseId: courseId,
      tutorId: tutorId
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      message: 'Exams fetched successfully',
      data: exams
    });
  } catch (error) {
    console.error('Error fetching exams by course:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch exams',
      error: error.message
    });
  }
}));

// Create new exam
router.post('/', asyncHandler(async (req, res) => {
  try {
    const { examName, courseId, description, questions, answerMode } = req.body;
    const tutorId = req.headers.tutorid;
    const tutorName = req.headers.name;

    console.log(`LOGGING QUESTIONS`, questions);
    console.log(`LOGGING COURSE ID`, courseId);

    // Validate required fields
    if (!examName || !courseId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide exam name and course'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid course ID'
      });
    }

    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(400).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check if exam with same name already exists for this tutor and course
    const existingExam = await Exam.findOne({
      examName,
      courseId,
      tutorId
    });

    // Calculate total marks from questions
    let totalMarks = 0;
    let questionsArray = [];
    
    if (questions && Array.isArray(questions) && questions.length > 0) {
      // ensure each question has a stable questionId to satisfy schema validation
      questionsArray = questions.map((q) => ({
        ...q,
        questionId: q.questionId || (new mongoose.Types.ObjectId()).toString()
      }));
      totalMarks = questionsArray.reduce((sum, q) => sum + (q.marks || 0), 0);
    }

    if (answerMode && !['student', 'tutor'].includes(answerMode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid answer mode'
      });
    }

    const newExam = new Exam({
      examName,
      courseId,
      courseName: course.name || course.courseName || '',
      tutorId,
      tutorName,
      description: description || '',
      answerMode: answerMode || 'student',
      questions: questionsArray,
      totalMarks: totalMarks,
      allowAutoMarking: false
    });

    await newExam.save();

    res.status(201).json({
      success: true,
      message: 'Exam created successfully',
      data: newExam
    });
  } catch (error) {
    console.error('Error creating exam:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create exam',
      error: error.message
    });
  }
}));

// Update exam details (not questions)
router.put('/:examId', asyncHandler(async (req, res) => {
  try {
    const { examId } = req.params;
    const { examName, description, isPublished, questions, courseId, answerMode } = req.body;
    const tutorId = req.headers.tutorid;

    if (!mongoose.Types.ObjectId.isValid(examId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid exam ID'
      });
    }

    const exam = await Exam.findOne({
      _id: examId,
      tutorId: tutorId
    });

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    // Update course if provided
    if (courseId) {
      if (!mongoose.Types.ObjectId.isValid(courseId)) {
        return res.status(400).json({ success: false, message: 'Invalid course ID' });
      }
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(400).json({ success: false, message: 'Course not found' });
      }
      exam.courseId = courseId;
      exam.courseName = course.name || course.courseName || '';
    }

    // Update other fields
    if (examName) exam.examName = examName;
    if (description !== undefined) exam.description = description;
    if (isPublished !== undefined) exam.isPublished = isPublished;
    if (answerMode !== undefined) {
      if (!['student', 'tutor'].includes(answerMode)) {
        return res.status(400).json({ success: false, message: 'Invalid answer mode' });
      }
      exam.answerMode = answerMode;
    }

    // Update questions if provided
    if (questions && Array.isArray(questions)) {
      const normalized = questions.map((q) => ({
        ...q,
        questionId: q.questionId || (new mongoose.Types.ObjectId()).toString()
      }));
      exam.questions = normalized;
      // Recalculate total marks
      exam.totalMarks = normalized.reduce((sum, q) => sum + (q.marks || 0), 0);
    }

    await exam.save();

    res.json({
      success: true,
      message: 'Exam updated successfully',
      data: exam
    });
  } catch (error) {
    console.error('Error updating exam:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update exam',
      error: error.message
    });
  }
}));

// Delete exam
router.delete('/:examId', asyncHandler(async (req, res) => {
  try {
    const { examId } = req.params;
    const tutorId = req.headers.tutorid;

    if (!mongoose.Types.ObjectId.isValid(examId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid exam ID'
      });
    }

    const exam = await Exam.findOneAndDelete({
      _id: examId,
      tutorId: tutorId
    });

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    res.json({
      success: true,
      message: 'Exam deleted successfully',
      data: exam
    });
  } catch (error) {
    console.error('Error deleting exam:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete exam',
      error: error.message
    });
  }
}));

// Add question to exam
router.post('/:examId/questions', asyncHandler(async (req, res) => {
  try {
    const { examId } = req.params;
    const tutorId = req.headers.tutorid;
    const { questionId, type, question, marks, choices, maxCharacters, matchingLeft, matchingRight, matchingPairs, sections } = req.body;

    if (!mongoose.Types.ObjectId.isValid(examId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid exam ID'
      });
    }

    // Validate required question fields
    if (!questionId || !type || !question || !marks) {
      return res.status(400).json({
        success: false,
        message: 'Please provide questionId, type, question, and marks'
      });
    }

    const exam = await Exam.findOne({
      _id: examId,
      tutorId: tutorId
    });

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    // Check if question ID already exists
    if (exam.questions.some(q => q.questionId === questionId)) {
      return res.status(400).json({
        success: false,
        message: 'A question with this ID already exists in the exam'
      });
    }

    // Create question object based on type
    const newQuestion = {
      questionId,
      type,
      question,
      marks
    };

    if (type === 'multipleChoice' && choices) {
      newQuestion.choices = choices;
    } else if (type === 'essay') {
      newQuestion.maxCharacters = maxCharacters;
    } else if (type === 'matching' && matchingLeft && matchingRight) {
      newQuestion.matchingLeft = matchingLeft;
      newQuestion.matchingRight = matchingRight;
      newQuestion.matchingPairs = matchingPairs || [];
    } else if (type === 'experimental' && sections) {
      newQuestion.sections = sections;
    }

    exam.questions.push(newQuestion);
    await exam.save();

    res.status(201).json({
      success: true,
      message: 'Question added successfully',
      data: exam
    });
  } catch (error) {
    console.error('Error adding question:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add question',
      error: error.message
    });
  }
}));

// Update question in exam
router.put('/:examId/questions/:questionId', asyncHandler(async (req, res) => {
  try {
    const { examId, questionId } = req.params;
    const tutorId = req.headers.tutorid;
    const updateData = req.body;

    if (!mongoose.Types.ObjectId.isValid(examId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid exam ID'
      });
    }

    const exam = await Exam.findOne({
      _id: examId,
      tutorId: tutorId
    });

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    const questionIndex = exam.questions.findIndex(q => q.questionId === questionId);
    if (questionIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Question not found in exam'
      });
    }

    // Update question fields
    Object.assign(exam.questions[questionIndex], updateData);
    await exam.save();

    res.json({
      success: true,
      message: 'Question updated successfully',
      data: exam
    });
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update question',
      error: error.message
    });
  }
}));

// Delete question from exam
router.delete('/:examId/questions/:questionId', asyncHandler(async (req, res) => {
  try {
    const { examId, questionId } = req.params;
    const tutorId = req.headers.tutorid;

    if (!mongoose.Types.ObjectId.isValid(examId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid exam ID'
      });
    }

    const exam = await Exam.findOne({
      _id: examId,
      tutorId: tutorId
    });

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    exam.questions = exam.questions.filter(q => q.questionId !== questionId);
    await exam.save();

    res.json({
      success: true,
      message: 'Question deleted successfully',
      data: exam
    });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete question',
      error: error.message
    });
  }
}));

module.exports = router;
