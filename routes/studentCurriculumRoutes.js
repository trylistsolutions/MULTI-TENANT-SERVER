const express = require('express')
const router = express.Router()
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const Group = require('../models/Group')
const User = require('../models/User')
const Alumni = require('../models/Alumni') // Add Alumni import

const JWT_SECRET = process.env.ZOEZI_JWT_SECRET || 'zoezi_secret'

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

// GET /student-curriculum?courseId=...&userType=... - Get curriculum for student/alumni's group in a course
router.get('/', verifyToken, async (req, res) => {
  try {
    const { courseId, userType } = req.query // Get userType from query
    if (!courseId) return res.status(400).json({ status: 'error', message: 'courseId required' })
    if (!userType) return res.status(400).json({ status: 'error', message: 'userType required' })

    // SPECIAL CASE: If courseId is "69327f9018e6e370bd203c5c", directly search groups collection
    if (courseId === "69327f9018e6e370bd203c5c") {
      console.log("📦 SPECIAL COURSE DETECTED: Bypassing checks and fetching directly from Groups");
      
      // Find group for this course ID
      const group = await Group.findOne({ courseId: courseId });
      if (!group) {
        return res.status(404).json({ 
          status: 'error', 
          message: 'No group found for this course in the database' 
        });
      }
      
      // Get tutor info if exists
      let tutor = null;
      if (group.tutorId) {
        const Tutor = require('../models/Tutor');
        tutor = await Tutor.findById(group.tutorId).select('firstName lastName email phone').lean();
      }
      
      // Mock course enrollment data for response structure
      const mockCourseEnroll = {
        courseId: courseId,
        name: group.courseName || "Presentation Course",
        status: "ASSIGNED",
        enrollmentDate: new Date()
      };
      
      return res.status(200).json({
        status: 'success',
        data: {
          group,
          tutor,
          courseEnroll: mockCourseEnroll
        }
      });
    }

    // NORMAL FLOW for other course IDs
    // Determine which model to use based on userType
    let model;
    if (userType === 'student') {
      model = User;
    } else if (userType === 'alumni') {
      model = Alumni;
    } else {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Invalid user type. Must be "student" or "alumni"' 
      });
    }

    // Find user's record (student or alumni)
    const user = await model.findById(req.userId)
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' })

    // Find course enrollment
    const courseEnroll = user.courses.find(c => String(c.courseId) === String(courseId))
    if (!courseEnroll) return res.status(404).json({ status: 'error', message: 'Not enrolled in this course' })

    // Find group user belongs to in this course
    if (!courseEnroll.assignedGroup?.groupId) {
      return res.status(404).json({ status: 'error', message: 'Not assigned to a group yet' })
    }

    const group = await Group.findById(courseEnroll.assignedGroup.groupId)
    if (!group) return res.status(404).json({ status: 'error', message: 'Group not found' })

    // Get tutor info
    const Tutor = require('../models/Tutor')
    const tutor = await Tutor.findById(group.tutorId).select('firstName lastName email phone').lean()

    return res.status(200).json({
      status: 'success',
      data: {
        group,
        tutor,
        courseEnroll
      }
    })
  } catch (err) {
    console.error('Get student curriculum error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to fetch curriculum' })
  }
})

// POST /student-curriculum/:groupId/items/:itemId/respond - Student/Alumni submits response/question
router.post('/:groupId/items/:itemId/respond', verifyToken, async (req, res) => {
  try {
    const { groupId, itemId } = req.params
    const { responseText, attachments, isQuestion, isPublic, userType } = req.body // Get userType from body

    const group = await Group.findById(groupId)
    if (!group) return res.status(404).json({ status: 'error', message: 'Group not found' })

    // Verify student/alumni is in this group
    // const studentInGroup = group.students.find(s => String(s.studentId) === String(req.userId))
    // if (!studentInGroup) return res.status(403).json({ status: 'error', message: 'Not in this group' })

    const item = group.curriculumItems.id(itemId)
    if (!item) return res.status(404).json({ status: 'error', message: 'Item not found' })

    // Check if released
    if (item.releaseDate && new Date(`${item.releaseDate}T${item.releaseTime}`) > new Date()) {
      return res.status(403).json({ status: 'error', message: 'Item not yet released' })
    }

    // Determine which model to use based on userType
    let model;
    if (userType === 'student') {
      model = User;
    } else if (userType === 'alumni') {
      model = Alumni;
    } else {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Invalid user type' 
      });
    }

    const user = await model.findById(req.userId).select('firstName lastName').lean()
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' })
    
    if (!item.responses) item.responses = []

    // Process attachments - filter out 'none' type or incomplete attachments
    const validAttachments = Array.isArray(attachments) 
      ? attachments.filter(att => 
          att.type && att.type !== 'none' && 
          att.url && att.url.trim() && 
          att.title && att.title.trim()
        )
      : []

    item.responses.push({
      studentId: req.userId,
      studentName: `${user.firstName} ${user.lastName}`,
      responseText: responseText || '',
      attachments: validAttachments,
      isQuestion: isQuestion || false,
      isPublic: isPublic || false
    })

    await group.save()
    return res.status(201).json({ status: 'success', data: { group } })
  } catch (err) {
    console.error('Submit response error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to submit response' })
  }
})

// POST /student-curriculum/hide-payment-notification - Hide payment widget
router.post('/hide-payment-notification', verifyToken, async (req, res) => {
  try {
    const { courseId, userType } = req.body // Get userType from body
    if (!courseId) return res.status(400).json({ status: 'error', message: 'courseId required' })
    if (!userType) return res.status(400).json({ status: 'error', message: 'userType required' })

    // Determine which model to use based on userType
    let model;
    if (userType === 'student') {
      model = User;
    } else if (userType === 'alumni') {
      model = Alumni;
    } else {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Invalid user type' 
      });
    }

    const user = await model.findById(req.userId)
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' })
    
    const courseEnroll = user.courses.find(c => String(c.courseId) === String(courseId))
    
    if (!courseEnroll) return res.status(404).json({ status: 'error', message: 'Not enrolled in this course' })

    courseEnroll.paymentNotificationHidden = true
    await user.save()

    return res.status(200).json({ status: 'success', message: 'Notification hidden' })
  } catch (err) {
    console.error('Hide notification error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to hide notification' })
  }
})

// PUT /student-curriculum/:groupId/items/:itemId/responses/:responseId - Tutor adds remark
router.put('/:groupId/items/:itemId/responses/:responseId', verifyToken, async (req, res) => {
  try {
    const { groupId, itemId, responseId } = req.params
    const { tutorRemark } = req.body

    const group = await Group.findById(groupId)
    if (!group) return res.status(404).json({ status: 'error', message: 'Group not found' })

    // Verify tutor owns this group
    if (String(group.tutorId) !== String(req.userId) && req.userType !== 'admin') {
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }

    const item = group.curriculumItems.id(itemId)
    if (!item) return res.status(404).json({ status: 'error', message: 'Item not found' })

    const response = item.responses.id(responseId)
    if (!response) return res.status(404).json({ status: 'error', message: 'Response not found' })

    response.tutorRemark = tutorRemark || ''
    response.tutorRemarkAt = new Date()

    await group.save()
    return res.status(200).json({ status: 'success', data: { item } })
  } catch (err) {
    console.error('Add remark error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to add remark' })
  }
})

// DELETE /student-curriculum/:groupId/items/:itemId/responses/:responseId - Delete response
router.delete('/:groupId/items/:itemId/responses/:responseId', verifyToken, async (req, res) => {
  try {
    const { groupId, itemId, responseId } = req.params
    const group = await Group.findById(groupId)

    if (!group) return res.status(404).json({ status: 'error', message: 'Group not found' })

    const item = group.curriculumItems.id(itemId)
    if (!item) return res.status(404).json({ status: 'error', message: 'Item not found' })

    const response = item.responses.id(responseId)
    if (!response) return res.status(404).json({ status: 'error', message: 'Response not found' })

    // Only student who submitted or tutor can delete
    if (String(response.studentId) !== String(req.userId) && String(group.tutorId) !== String(req.userId) && req.userType !== 'admin') {
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }

    response.deleteOne()
    await group.save()

    return res.status(200).json({ status: 'success', data: { item } })
  } catch (err) {
    console.error('Delete response error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to delete response' })
  }
})

module.exports = router
