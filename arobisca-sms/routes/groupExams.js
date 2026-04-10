const express = require('express');
const asyncHandler = require('express-async-handler');
const router = express.Router();
const mongoose = require('mongoose');

const Group = require('../models/group');
const Student = require('../models/student');
const Exam = require('../models/exam');
const Course = require('../models/courses');

// Get assigned exams for a group
router.get('/:groupId/exams', asyncHandler(async (req, res) => {
  try {
    const { groupId } = req.params;
    const tutorId = req.headers.tutorid;

    if (!mongoose.Types.ObjectId.isValid(groupId)) return res.status(400).json({ success: false, message: 'Invalid group id' });

    const group = await Group.findOne({ _id: groupId, tutorId }).populate('exams.exam', 'examName courseId tutorId');
    if (!group) return res.status(404).json({ success: false, message: 'Group not found or not owned by you' });

    return res.json({ success: true, data: group.exams });
  } catch (error) {
    console.error('Error fetching group exams', error);
    res.status(500).json({ success: false, message: error.message });
  }
}));

// Assign an exam to a group
router.post('/:groupId/assign', asyncHandler(async (req, res) => {
  try {
    const { groupId } = req.params;
    const tutorId = req.headers.tutorid;
    const tutorName = req.headers.name;
    const { examId, examSchemeName, startDate, endDate } = req.body;

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(examId)) {
      return res.status(400).json({ success: false, message: 'Invalid ids provided' });
    }

    const group = await Group.findOne({ _id: groupId, tutorId });
    if (!group) return res.status(404).json({ success: false, message: 'Group not found or not owned by you' });

    const exam = await Exam.findById(examId);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    // Prevent duplicate assignment: a group cannot have the same exam assigned more than once
    // (robust to populated exam docs or raw ObjectId strings)
    if (group.exams && group.exams.some(e => {
      const existingExamId = e && e.exam ? (e.exam._id ? e.exam._id : e.exam) : null;
      return existingExamId && String(existingExamId) === String(exam._id);
    })) {
      return res.status(400).json({ success: false, message: 'Exam already assigned to this group' });
    }

    // Try to derive scheme weight from course
    let schemeWeight = req.body.examSchemeWeight || null;
    try {
      const course = await Course.findById(exam.courseId);
      if (course && Array.isArray(course.examScheme) && examSchemeName) {
        const scheme = course.examScheme.find(s => s.name === examSchemeName);
        if (scheme) schemeWeight = scheme.weight;
      }
    } catch (err) {
      // ignore
    }

    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    if (start && end && start >= end) return res.status(400).json({ success: false, message: 'End date must be after start date' });

    const examEntry = {
      exam: exam._id,
      examName: exam.examName,
      examSchemeName: examSchemeName || null,
      examSchemeWeight: schemeWeight,
      startDate: start,
      endDate: end,
      assignedBy: group.tutorId || tutorId,
      status: start && start <= new Date() ? 'active' : 'upcoming'
    };

    group.exams = group.exams || [];
    group.exams.push(examEntry);
    await group.save();

    // Propagate to students in the group
    await Student.updateMany(
      { groupId: group._id },
      { $push: { assignedExams: {
        groupId: group._id,
        exam: exam._id,
        examName: exam.examName,
        examSchemeName: examEntry.examSchemeName,
        examSchemeWeight: examEntry.examSchemeWeight,
        startDate: examEntry.startDate,
        endDate: examEntry.endDate,
        status: examEntry.status
      } } }
    );

    return res.status(201).json({ success: true, message: 'Exam assigned', data: examEntry });
  } catch (error) {
    console.error('Error assigning exam', error);
    res.status(500).json({ success: false, message: error.message });
  }
}));

// Update an assigned exam entry on a group
router.put('/:groupId/exams/:examId', asyncHandler(async (req, res) => {
  try {
    const { groupId, examId } = req.params;
    const tutorId = req.headers.tutorid;
    const { startDate, endDate, status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(examId)) return res.status(400).json({ success: false, message: 'Invalid ids' });

    const group = await Group.findOne({ _id: groupId, tutorId });
    if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

    const entry = group.exams.id(examId) || group.exams.find(e => {
      const existingExamId = e && e.exam ? (e.exam._id ? e.exam._id : e.exam) : null;
      return existingExamId && String(existingExamId) === String(examId);
    });
    if (!entry) return res.status(404).json({ success: false, message: 'Assigned exam entry not found' });

    if (startDate) entry.startDate = new Date(startDate);
    if (endDate) entry.endDate = new Date(endDate);
    if (status) entry.status = status;

    // validate dates
    if (entry.startDate && entry.endDate && entry.startDate >= entry.endDate) return res.status(400).json({ success: false, message: 'End date must be after start date' });

    await group.save();

    // Propagate to students (update first matched array entry per student)
    await Student.updateMany(
      { groupId: group._id, 'assignedExams.exam': entry.exam },
      { $set: {
        'assignedExams.$.startDate': entry.startDate,
        'assignedExams.$.endDate': entry.endDate,
        'assignedExams.$.status': entry.status
      } }
    );

    return res.json({ success: true, message: 'Assignment updated', data: entry });
  } catch (error) {
    console.error('Error updating assignment', error);
    res.status(500).json({ success: false, message: error.message });
  }
}));

// Remove an assigned exam from a group
router.delete('/:groupId/exams/:examId', asyncHandler(async (req, res) => {
  try {
    const { groupId, examId } = req.params;
    const tutorId = req.headers.tutorid;

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(examId)) return res.status(400).json({ success: false, message: 'Invalid ids' });

    const group = await Group.findOne({ _id: groupId, tutorId });
    if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

    const examObjectId = new mongoose.Types.ObjectId(examId);

    // remove matching entries from group.exams
    group.exams = (group.exams || []).filter(e => {
      const entryId = e && e._id ? e._id : null;
      const existingExamId = e && e.exam ? (e.exam._id ? e.exam._id : e.exam) : null;
      const match = (entryId && String(entryId) === String(examObjectId)) || (existingExamId && String(existingExamId) === String(examObjectId));
      return !match;
    });
    await group.save();

    // remove from students assignedExams
    await Student.updateMany(
      { groupId: group._id },
      { $pull: { assignedExams: { exam: examObjectId } } }
    );

    return res.json({ success: true, message: 'Assignment removed' });
  } catch (error) {
    console.error('Error removing assignment', error);
    res.status(500).json({ success: false, message: error.message });
  }
}));

// Assign an exam to individual students
router.post('/assign-to-students', asyncHandler(async (req, res) => {
  try {
    const tutorId = req.headers.tutorid;
    const { examId, studentIds, examSchemeName, startDate, endDate } = req.body;

    if (!mongoose.Types.ObjectId.isValid(examId)) {
      return res.status(400).json({ success: false, message: 'Invalid exam id' });
    }

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'No students selected' });
    }

    // Validate all student IDs
    for (const studentId of studentIds) {
      if (!mongoose.Types.ObjectId.isValid(studentId)) {
        return res.status(400).json({ success: false, message: `Invalid student id: ${studentId}` });
      }
    }

    const exam = await Exam.findById(examId);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    // Try to derive scheme weight from course
    let schemeWeight = req.body.examSchemeWeight || null;
    if (exam.courseId) {
      try {
        const course = await Course.findById(exam.courseId);
        if (course && Array.isArray(course.examScheme) && examSchemeName) {
          const scheme = course.examScheme.find(s => s.name === examSchemeName);
          if (scheme) schemeWeight = scheme.weight;
        }
      } catch (err) {
        // ignore
      }
    }

    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    if (start && end && start >= end) return res.status(400).json({ success: false, message: 'End date must be after start date' });

    const examEntry = {
      exam: exam._id,
      examName: exam.examName,
      examSchemeName: examSchemeName || null,
      examSchemeWeight: schemeWeight,
      startDate: start,
      endDate: end,
      assignedBy: tutorId,
      status: start && start <= new Date() ? 'active' : 'upcoming',
      // Note: no groupId for individual assignments
    };

    // Assign to each student
    const assignedStudents = [];
    for (const studentId of studentIds) {
      try {
        // Check if student already has this exam assigned
        const student = await Student.findById(studentId);
        if (!student) {
          console.warn(`Student ${studentId} not found`);
          continue;
        }

        // Check for duplicate assignment
        const hasDuplicate = student.assignedExams && student.assignedExams.some(e => String(e.exam) === String(exam._id));
        if (hasDuplicate) {
          console.warn(`Student ${studentId} already has exam ${exam._id} assigned`);
          continue;
        }

        // Add exam to student's assignedExams
        await Student.findByIdAndUpdate(
          studentId,
          { 
            $push: { 
              assignedExams: {
                // Note: groupId omitted for individual assignments
                exam: exam._id,
                examName: exam.examName,
                examSchemeName: examEntry.examSchemeName,
                examSchemeWeight: examEntry.examSchemeWeight,
                startDate: examEntry.startDate,
                endDate: examEntry.endDate,
                status: examEntry.status
              }
            }
          },
          { new: true }
        );
        assignedStudents.push(studentId);
      } catch (err) {
        console.error(`Error assigning exam to student ${studentId}:`, err);
      }
    }

    return res.status(201).json({ 
      success: true, 
      message: `Exam assigned to ${assignedStudents.length} student(s)`, 
      data: { 
        examId, 
        assignedStudents,
        examEntry 
      } 
    });
  } catch (error) {
    console.error('Error assigning exam to students', error);
    res.status(500).json({ success: false, message: error.message });
  }
}));

// Update an individually assigned exam for a student
router.put('/students/:studentId/assigned-exams/:examId', asyncHandler(async (req, res) => {
  try {
    const { studentId, examId } = req.params;
    const { startDate, endDate } = req.body;
    const tutorId = req.headers.tutorid;

    if (!mongoose.Types.ObjectId.isValid(studentId) || !mongoose.Types.ObjectId.isValid(examId)) {
      return res.status(400).json({ success: false, message: 'Invalid IDs' });
    }

    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    // Find the assigned exam entry
    const examEntry = student.assignedExams.find(e => String(e.exam) === String(examId));
    if (!examEntry) return res.status(404).json({ success: false, message: 'Exam assignment not found' });

    // Verify this is an individual assignment (no groupId)
    if (examEntry.groupId) {
      return res.status(400).json({ success: false, message: 'Cannot edit group-assigned exams here. Use group assignment manager.' });
    }

    // Update dates
    if (startDate) examEntry.startDate = new Date(startDate);
    if (endDate) examEntry.endDate = new Date(endDate);

    // Validate dates
    if (examEntry.startDate && examEntry.endDate && examEntry.startDate >= examEntry.endDate) {
      return res.status(400).json({ success: false, message: 'End date must be after start date' });
    }

    // Update status based on dates
    if (examEntry.startDate) {
      const now = new Date();
      if (examEntry.startDate <= now && examEntry.endDate > now) {
        examEntry.status = 'active';
      } else if (examEntry.endDate <= now) {
        examEntry.status = 'closed';
      } else {
        examEntry.status = 'upcoming';
      }
    }

    await student.save();

    return res.json({ success: true, message: 'Exam schedule updated', data: examEntry });
  } catch (error) {
    console.error('Error updating individual exam assignment', error);
    res.status(500).json({ success: false, message: error.message });
  }
}));

// Delete an individually assigned exam from a student
router.delete('/students/:studentId/assigned-exams/:examId', asyncHandler(async (req, res) => {
  try {
    const { studentId, examId } = req.params;
    const tutorId = req.headers.tutorid;

    if (!mongoose.Types.ObjectId.isValid(studentId) || !mongoose.Types.ObjectId.isValid(examId)) {
      return res.status(400).json({ success: false, message: 'Invalid IDs' });
    }

    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    // Find the assigned exam entry
    const examEntry = student.assignedExams.find(e => String(e.exam) === String(examId));
    if (!examEntry) return res.status(404).json({ success: false, message: 'Exam assignment not found' });

    // Verify this is an individual assignment (no groupId)
    if (examEntry.groupId) {
      return res.status(400).json({ success: false, message: 'Cannot delete group-assigned exams here. Use group assignment manager.' });
    }

    // Remove the exam from assignedExams
    student.assignedExams = student.assignedExams.filter(e => String(e.exam) !== String(examId));
    
    // Also remove any associated response
    student.examResponses = student.examResponses.filter(resp => String(resp.exam) !== String(examId));

    await student.save();

    return res.json({ success: true, message: 'Exam assignment removed' });
  } catch (error) {
    console.error('Error deleting individual exam assignment', error);
    res.status(500).json({ success: false, message: error.message });
  }
}));

module.exports = router;
