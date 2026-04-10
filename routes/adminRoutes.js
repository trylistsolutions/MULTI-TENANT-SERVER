const express = require('express')
const router = express.Router()
const mongoose = require('mongoose')
const User = require('../models/User')
const Alumni = require('../models/Alumni') // Add Alumni import
const Course = require('../models/Course')
const Tutor = require('../models/Tutor')

// GET /admin/assignments - returns courses with enrolledStudents and tutors (UPDATED)
router.get('/assignments', async (req, res) => {
  try {
    const courses = await Course.find({}).select('name enrolledStudents').lean()
    const tutors = await Tutor.find({}).select('firstName lastName email phone myStudents').lean()

    // For each course, check if enrolled students are User or Alumni
    const enrichedCourses = await Promise.all(courses.map(async (course) => {
      if (!course.enrolledStudents || course.enrolledStudents.length === 0) {
        return course
      }

      const enrichedStudents = await Promise.all(course.enrolledStudents.map(async (student) => {
        // Check User model first
        let user = await User.findById(student.studentId).select('userType').lean()
        let userType = 'student'
        
        if (!user) {
          // Check Alumni model
          user = await Alumni.findById(student.studentId).select('userType').lean()
          if (user) {
            userType = 'alumni'
          }
        }
        
        return {
          ...student,
          userType // Add userType to student data
        }
      }))

      return {
        ...course,
        enrolledStudents: enrichedStudents
      }
    }))

    // Add counts to tutors
    const tutorsWithCount = tutors.map(t => ({
      _id: t._id,
      name: `${t.firstName} ${t.lastName}`,
      email: t.email,
      phone: t.phone,
      assignedCount: (t.myStudents || []).length
    }))

    return res.status(200).json({ 
      status: 'success', 
      data: { 
        courses: enrichedCourses, 
        tutors: tutorsWithCount 
      } 
    })
  } catch (err) {
    console.error('Admin assignments fetch error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to fetch assignments' })
  }
})

// POST /admin/assign - assign a student to a tutor (UPDATED)
router.post('/assign', async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const { tutorId, courseId, studentId } = req.body
    if (!tutorId || !courseId || !studentId) {
      await session.abortTransaction(); session.endSession()
      return res.status(400).json({ status: 'error', message: 'Missing required fields' })
    }

    const tutor = await Tutor.findById(tutorId).session(session)
    const course = await Course.findById(courseId).session(session)
    
    if (!tutor || !course) {
      await session.abortTransaction(); session.endSession()
      return res.status(404).json({ status: 'error', message: 'Tutor or Course not found' })
    }

    // Check both User and Alumni models
    let user = await User.findById(studentId).session(session)
    let isAlumni = false
    
    if (!user) {
      // If not found in User model, check Alumni model
      user = await Alumni.findById(studentId).session(session)
      isAlumni = true
      
      if (!user) {
        await session.abortTransaction(); session.endSession()
        return res.status(404).json({ status: 'error', message: 'Student/Alumni not found' })
      }
    }

    // Update user.courses entry for this course (works for both User and Alumni)
    const userCourse = (user.courses || []).find(sc => String(sc.courseId) === String(courseId))
    if (!userCourse) {
      await session.abortTransaction(); session.endSession()
      return res.status(404).json({ status: 'error', message: 'User not enrolled in the specified course' })
    }

    userCourse.assignmentStatus = 'ASSIGNED'
    userCourse.tutor = {
      id: tutor._id,
      name: `${tutor.firstName} ${tutor.lastName}`,
      email: tutor.email,
      phone: tutor.phone,
      status: 'ASSIGNED'
    }
    await user.save({ session })

    // Update course enrolledStudents entry
    const stu = (course.enrolledStudents || []).find(es => String(es.studentId) === String(studentId))
    if (stu) {
      stu.assignmentStatus = 'ASSIGNED'
      stu.tutor = {
        id: tutor._id,
        name: `${tutor.firstName} ${tutor.lastName}`,
        email: tutor.email,
        phone: tutor.phone,
        status: 'ASSIGNED'
      }
      
      // Update userType if it's alumni
      if (isAlumni) {
        stu.userType = 'alumni'
      }
    }
    await course.save({ session })

    // Add to tutor.myStudents
    tutor.myStudents = tutor.myStudents || []
    tutor.myStudents.push({
      studentId: user._id,
      name: `${user.firstName} ${user.lastName}`,
      courseId: course._id,
      courseName: course.name,
      paymentStatus: (stu && stu.payment && stu.payment.status) || 'PENDING',
      userType: isAlumni ? 'alumni' : 'student', // Track user type
      assignedAt: new Date()
    })
    await tutor.save({ session })

    await session.commitTransaction(); session.endSession()
    return res.status(200).json({ 
      status: 'success', 
      message: `${isAlumni ? 'Alumni' : 'Student'} assigned to tutor` 
    })
  } catch (err) {
    await session.abortTransaction(); session.endSession()
    console.error('Assign student error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to assign student' })
  }
})

// POST /admin/cancel - cancel a student's enrollment/assignment with admin note (UPDATED)
router.post('/cancel', async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const { courseId, studentId, reason } = req.body
    if (!courseId || !studentId || !reason) {
      await session.abortTransaction(); session.endSession()
      return res.status(400).json({ status: 'error', message: 'Missing required fields' })
    }

    const course = await Course.findById(courseId).session(session)
    
    if (!course) {
      await session.abortTransaction(); session.endSession()
      return res.status(404).json({ status: 'error', message: 'Course not found' })
    }

    // Check both User and Alumni models
    let user = await User.findById(studentId).session(session)
    
    if (!user) {
      // If not found in User model, check Alumni model
      user = await Alumni.findById(studentId).session(session)
      
      if (!user) {
        await session.abortTransaction(); session.endSession()
        return res.status(404).json({ status: 'error', message: 'Student/Alumni not found' })
      }
    }

    // Update user.courses entry (works for both User and Alumni)
    const userCourse = (user.courses || []).find(sc => String(sc.courseId) === String(courseId))
    if (!userCourse) {
      await session.abortTransaction(); session.endSession()
      return res.status(404).json({ status: 'error', message: 'User not enrolled in the specified course' })
    }
    
    userCourse.assignmentStatus = 'CANCELLED'
    userCourse.tutor = userCourse.tutor || {}
    userCourse.tutor.status = 'CANCELLED'
    userCourse.adminNotes = reason
    await user.save({ session })

    // Update course enrolledStudents entry
    const stu = (course.enrolledStudents || []).find(es => String(es.studentId) === String(studentId))
    if (stu) {
      stu.assignmentStatus = 'CANCELLED'
      stu.tutor = stu.tutor || {}
      stu.tutor.status = 'CANCELLED'
      stu.adminNotes = reason
    }
    await course.save({ session })

    await session.commitTransaction(); session.endSession()
    return res.status(200).json({ status: 'success', message: 'Student cancelled with note' })
  } catch (err) {
    await session.abortTransaction(); session.endSession()
    console.error('Cancel student error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to cancel student' })
  }
})

module.exports = router
