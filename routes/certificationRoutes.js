const express = require('express')
const router = express.Router()
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const Alumni = require('../models/Alumni') // Add Alumni import
const Tutor = require('../models/Tutor')
const Group = require('../models/Group')
const Course = require('../models/Course')

const JWT_SECRET = process.env.ZOEZI_JWT_SECRET

function verifyToken(req, res, next) {
  const auth = req.headers.authorization || req.headers.Authorization
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ status: 'error', message: 'Missing token' })
  const token = auth.split(' ')[1]
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.userId = payload.id
    req.userType = payload.type
    next()
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Invalid token' })
  }
}

// Grade to GPA conversion
const gradeToGPA = {
  'Distinction': 4.0,
  'Merit': 3.7,
  'Credit': 3.0,
  'Pass': 2.0,
  'Fail': 0.0
}

const calculateGPA = (exams) => {
  if (!exams || exams.length === 0) return 0
  const total = exams.reduce((sum, exam) => sum + (gradeToGPA[exam.grade] || 0), 0)
  return (total / exams.length).toFixed(2)
}

// Helper function to check both User and Alumni models
const findStudentById = async (studentId) => {
  let student = await User.findById(studentId)
  let isAlumni = false
  
  if (!student) {
    student = await Alumni.findById(studentId)
    isAlumni = true
  }
  
  return { student, isAlumni }
}


// GET /certification/students?groupId=... - Get all students/alumni in groups for tutor - UPDATED
router.get('/students', verifyToken, async (req, res) => {
  try {
    const { groupId } = req.query

    // Get groups for this tutor
    let groups
    if (groupId) {
      const group = await Group.findById(groupId)
      if (!group || String(group.tutorId) !== String(req.userId)) {
        return res.status(403).json({ status: 'error', message: 'Forbidden' })
      }
      groups = [group]
    } else {
      groups = await Group.find({ tutorId: req.userId })
    }

    // Enrich student/alumni data with course completion and payment info
    const enrichedGroups = await Promise.all(
      groups.map(async (group) => {
        const students = await Promise.all(
          group.students.map(async (enrollment) => {
            // Check both User and Alumni models
            const { student, isAlumni } = await findStudentById(enrollment.studentId)
            if (!student) return null

            // Find the course enrollment for this student/alumni
            const courseEnroll = student.courses?.find(c => String(c.courseId) === String(group.courseId))
            
            // Calculate completion percentage
            const completedItems = group.curriculumItems.filter(item => item.isCompleted).length
            const totalItems = group.curriculumItems.length
            const completionPercentage = totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100)

            return {
              studentId: student._id,
              studentName: `${student.firstName} ${student.lastName}`,
              email: student.email,
              phone: student.phone,
              idNumber: student.idNumber || 'N/A',
              userType: isAlumni ? 'alumni' : 'student', // Add userType
              completionPercentage,
              completedItems,
              totalItems,
              paymentStatus: courseEnroll?.payment?.status || 'PENDING',
              exams: courseEnroll?.exams || [],
              gpa: courseEnroll?.gpa || 0,
              finalGrade: courseEnroll?.finalGrade || '',
              certificationStatus: courseEnroll?.certificationStatus || 'PENDING'
            }
          })
        )
        return {
          groupId: group._id,
          groupName: group.name,
          courseId: group.courseId,
          courseName: group.courseName,
          students: students.filter(s => s !== null)
        }
      })
    )

    return res.status(200).json({ status: 'success', data: { groups: enrichedGroups } })
  } catch (err) {
    console.error('Get students error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to fetch students' })
  }
})

// POST /certification/:studentId/:courseId/exam - Add exam record - UPDATED
router.post('/:studentId/:courseId/exam', verifyToken, async (req, res) => {
  try {
    const { studentId, courseId } = req.params
    const { examName, grade } = req.body

    if (!examName || !grade) {
      return res.status(400).json({ status: 'error', message: 'Exam name and grade required' })
    }

    // Check both User and Alumni models
    const { student, isAlumni } = await findStudentById(studentId)
    if (!student) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'Student/Alumni not found' 
      })
    }

    const courseEnroll = student.courses.find(c => String(c.courseId) === String(courseId))
    if (!courseEnroll) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'Course enrollment not found' 
      })
    }

    // Add exam
    courseEnroll.exams = courseEnroll.exams || []
    courseEnroll.exams.push({ examName, grade })

    // Recalculate GPA and final grade
    courseEnroll.gpa = calculateGPA(courseEnroll.exams)
    courseEnroll.finalGrade = courseEnroll.exams.length > 0 ? 
      courseEnroll.exams[courseEnroll.exams.length - 1].grade : ''

    await student.save()

    return res.status(201).json({
      status: 'success',
      data: {
        exams: courseEnroll.exams,
        gpa: courseEnroll.gpa,
        finalGrade: courseEnroll.finalGrade,
        userType: isAlumni ? 'alumni' : 'student'
      }
    })
  } catch (err) {
    console.error('Add exam error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to add exam' })
  }
})

// DELETE /certification/:studentId/:courseId/exam/:examId - Delete exam - UPDATED
router.delete('/:studentId/:courseId/exam/:examId', verifyToken, async (req, res) => {
  try {
    const { studentId, courseId, examId } = req.params

    // Check both User and Alumni models
    const { student, isAlumni } = await findStudentById(studentId)
    if (!student) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'Student/Alumni not found' 
      })
    }

    const courseEnroll = student.courses.find(c => String(c.courseId) === String(courseId))
    if (!courseEnroll) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'Course enrollment not found' 
      })
    }

    // Remove exam
    const examIndex = courseEnroll.exams.findIndex(e => String(e._id) === String(examId))
    if (examIndex === -1) {
      return res.status(404).json({ status: 'error', message: 'Exam not found' })
    }

    courseEnroll.exams.splice(examIndex, 1)

    // Recalculate GPA and final grade
    courseEnroll.gpa = calculateGPA(courseEnroll.exams)
    courseEnroll.finalGrade = courseEnroll.exams.length > 0 ? 
      courseEnroll.exams[courseEnroll.exams.length - 1].grade : ''

    await student.save()

    return res.status(200).json({
      status: 'success',
      data: {
        exams: courseEnroll.exams,
        gpa: courseEnroll.gpa,
        finalGrade: courseEnroll.finalGrade,
        userType: isAlumni ? 'alumni' : 'student'
      }
    })
  } catch (err) {
    console.error('Delete exam error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to delete exam' })
  }
})

// POST /certification/:studentId/:courseId/graduate - Graduate student/alumni - UPDATED
router.post('/:studentId/:courseId/graduate', verifyToken, async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const { studentId, courseId } = req.params
    const { groupId } = req.body
    
    const tutor = await Tutor.findById(req.userId).session(session)
    const group = await Group.findById(groupId).session(session)

    if (!tutor) {
      await session.abortTransaction(); session.endSession()
      return res.status(404).json({ status: 'error', message: 'Tutor not found' })
    }
    
    if (!group) {
      await session.abortTransaction(); session.endSession()
      return res.status(404).json({ status: 'error', message: 'Group not found' })
    }

    // Check both User and Alumni models
    let student = await User.findById(studentId).session(session)
    let isAlumni = false
    let studentModel = User
    
    if (!student) {
      student = await Alumni.findById(studentId).session(session)
      isAlumni = true
      studentModel = Alumni
      
      if (!student) {
        await session.abortTransaction(); session.endSession()
        return res.status(404).json({ 
          status: 'error', 
          message: 'Student/Alumni not found' 
        })
      }
    }

    const courseEnroll = student.courses.find(c => String(c.courseId) === String(courseId))
    if (!courseEnroll) {
      await session.abortTransaction(); session.endSession()
      return res.status(404).json({ 
        status: 'error', 
        message: 'Course enrollment not found' 
      })
    }

    // VALIDATION CHECKLIST
    // 1. Check 100% completion
    const completedItems = group.curriculumItems.filter(item => item.isCompleted).length
    const totalItems = group.curriculumItems.length
    if (completedItems !== totalItems) {
      await session.abortTransaction(); session.endSession()
      return res.status(400).json({ 
        status: 'error', 
        message: `Course not 100% complete. ${completedItems}/${totalItems} items completed.` 
      })
    }

    // 2. Check payment
    if (courseEnroll.payment.status !== 'PAID') {
      await session.abortTransaction(); session.endSession()
      return res.status(400).json({ 
        status: 'error', 
        message: 'Payment not complete. Status: ' + courseEnroll.payment.status 
      })
    }

    // 3. Check exams exist
    if (!courseEnroll.exams || courseEnroll.exams.length === 0) {
      await session.abortTransaction(); session.endSession()
      return res.status(400).json({ 
        status: 'error', 
        message: 'No exam records found. Add at least one exam before graduation.' 
      })
    }

    // 4. Check no Fail grade
    if (courseEnroll.exams.some(e => e.grade === 'Fail')) {
      await session.abortTransaction(); session.endSession()
      return res.status(400).json({ 
        status: 'error', 
        message: 'Student has Fail grade(s). Cannot graduate.' 
      })
    }

    // All checks passed - Graduate student/alumni
    courseEnroll.certificationStatus = 'GRADUATED'
    courseEnroll.certificationDate = new Date()
    
    // For alumni, also update their alumni record
    if (isAlumni) {
      // If alumni is already an alumni (re-taking course), keep alumni status
      // If student is graduating to become alumni, update their status
      if (student.userType !== 'alumni') {
        student.userType = 'alumni'
        student.graduationDate = new Date()
      }
    }

    await student.save({ session })

    // Add to tutor's certified students
    tutor.certifiedStudents = tutor.certifiedStudents || []
    tutor.certifiedStudents.push({
      studentId: student._id,
      studentName: `${student.firstName} ${student.lastName}`,
      email: student.email,
      phone: student.phone,
      userType: isAlumni ? 'alumni' : 'student',
      courseId,
      courseName: courseEnroll.name,
      payment: {
        status: courseEnroll.payment.status,
        amount: courseEnroll.payment.amount,
        phone: courseEnroll.payment.phone,
        transactionId: courseEnroll.payment.transactionId,
        timeOfPayment: courseEnroll.payment.timeOfPayment
      },
      exams: courseEnroll.exams,
      gpa: courseEnroll.gpa,
      finalGrade: courseEnroll.finalGrade,
      certificationDate: courseEnroll.certificationDate
    })

    // Remove from myStudents
    tutor.myStudents = tutor.myStudents.filter(s => 
      !(String(s.studentId) === String(studentId) && String(s.courseId) === String(courseId))
    )

    // Remove from group
    group.students = group.students.filter(s => String(s.studentId) !== String(studentId))

    // Update course enrolled students
    const course = await Course.findById(courseId).session(session)
    if (course && course.enrolledStudents) {
      course.enrolledStudents = course.enrolledStudents.filter(s => 
        String(s.studentId) !== String(studentId)
      )
      await course.save({ session })
    }

    await Promise.all([
      tutor.save({ session }),
      group.save({ session })
    ])

    await session.commitTransaction(); session.endSession()
    
    return res.status(200).json({
      status: 'success',
      message: `${isAlumni ? 'Alumni' : 'Student'} graduated successfully`,
      data: { 
        certificationDate: courseEnroll.certificationDate,
        userType: isAlumni ? 'alumni' : 'student'
      }
    })
  } catch (err) {
    await session.abortTransaction(); session.endSession()
    console.error('Graduate student error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to graduate student' })
  }
})

module.exports = router
