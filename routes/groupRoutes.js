const express = require('express')
const router = express.Router()
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const Group = require('../models/Group')
const Tutor = require('../models/Tutor')
const User = require('../models/User')
const Alumni = require('../models/Alumni')

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

// GET /groups?tutorId=... - list groups for a tutor
router.get('/', verifyToken, async (req, res) => {
  try {
    const tutorId = req.query.tutorId || req.userId
    if (req.userType !== 'admin' && String(req.userId) !== String(tutorId)) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    const groups = await Group.find({ tutorId }).lean()
    return res.status(200).json({ status: 'success', data: { groups } })
  } catch (err) {
    console.error('Get groups error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to fetch groups' })
  }
})

// POST /groups - create group (tutor creates)
router.post('/', verifyToken, async (req, res) => {
  try {
    const { name, tutorId, courseId } = req.body
    const owner = tutorId || req.userId
    if (req.userType !== 'admin' && String(req.userId) !== String(owner)) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    if (!name || !courseId) return res.status(400).json({ status: 'error', message: 'Missing name or courseId' })
    const group = await Group.create({ name, tutorId: owner, courseId, students: [] })
    return res.status(201).json({ status: 'success', data: { group } })
  } catch (err) {
    console.error('Create group error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to create group' })
  }
})

// PUT /groups/:id - rename/update group
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params
    const { name } = req.body
    const group = await Group.findById(id)
    if (!group) return res.status(404).json({ status: 'error', message: 'Group not found' })
    if (req.userType !== 'admin' && String(req.userId) !== String(group.tutorId)) return res.status(403).json({ status: 'error', message: 'Forbidden' })
    if (name) group.name = name
    await group.save()
    return res.status(200).json({ status: 'success', data: { group } })
  } catch (err) {
    console.error('Update group error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to update group' })
  }
})

// DELETE /groups/:id - UPDATED to handle alumni students when deleting group
router.delete('/:id', verifyToken, async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const { id } = req.params
    const group = await Group.findById(id).session(session)
    if (!group) {
      await session.abortTransaction(); session.endSession()
      return res.status(404).json({ status: 'error', message: 'Group not found' })
    }
    
    if (req.userType !== 'admin' && String(req.userId) !== String(group.tutorId)) {
      await session.abortTransaction(); session.endSession()
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    
    // Before deleting group, unassign all students from this group
    if (group.students && group.students.length > 0) {
      // Update Tutor.myStudents
      const tutor = await Tutor.findById(group.tutorId).session(session)
      if (tutor && tutor.myStudents) {
        for (const groupStudent of group.students) {
          const myStudentEntry = tutor.myStudents.find(s => 
            String(s.studentId) === String(groupStudent.studentId)
          )
          if (myStudentEntry && myStudentEntry.assignedGroup?.groupId?.toString() === id) {
            myStudentEntry.isAssignedToGroup = false
            myStudentEntry.assignedGroup = {
              groupId: null,
              groupName: null
            }
          }
        }
        await tutor.save({ session })
      }
      
      // Update User/Alumni courses
      for (const groupStudent of group.students) {
        // Check User model first
        let student = await User.findById(groupStudent.studentId).session(session)
        
        if (!student) {
          // Check Alumni model
          student = await Alumni.findById(groupStudent.studentId).session(session)
        }
        
        if (student && student.courses) {
          const courseEntry = student.courses.find(c => 
            String(c.courseId) === String(group.courseId)
          )
          if (courseEntry && courseEntry.assignedGroup?.groupId?.toString() === id) {
            courseEntry.isAssignedToGroup = false
            courseEntry.assignedGroup = {
              groupId: null,
              groupName: null
            }
            await student.save({ session })
          }
        }
      }
    }
    
    await group.remove({ session })
    
    await session.commitTransaction(); session.endSession()
    return res.status(200).json({ status: 'success', message: 'Group deleted' })
  } catch (err) {
    await session.abortTransaction(); session.endSession()
    console.error('Delete group error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to delete group' })
  }
})

// POST /groups/:id/add-student - UPDATED to check both User and Alumni
router.post('/:id/add-student', verifyToken, async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const { id } = req.params
    const { studentId, name } = req.body
    if (!studentId) return res.status(400).json({ status: 'error', message: 'Missing studentId' })
    
    const group = await Group.findById(id).session(session)
    if (!group) {
      await session.abortTransaction(); session.endSession()
      return res.status(404).json({ status: 'error', message: 'Group not found' })
    }
    
    if (req.userType !== 'admin' && String(req.userId) !== String(group.tutorId)) {
      await session.abortTransaction(); session.endSession()
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    
    // Avoid duplicates
    if ((group.students || []).some(s => String(s.studentId) === String(studentId))) {
      await session.abortTransaction(); session.endSession()
      return res.status(409).json({ status: 'error', message: 'Student already in group' })
    }
    
    group.students = group.students || []
    group.students.push({ studentId, name })
    await group.save({ session })
    
    // Update tracking on Tutor.myStudents
    const tutor = await Tutor.findById(group.tutorId).session(session)
    if (tutor && tutor.myStudents) {
      const myStudentEntry = tutor.myStudents.find(s => String(s.studentId) === String(studentId))
      if (myStudentEntry) {
        myStudentEntry.isAssignedToGroup = true
        myStudentEntry.assignedGroup = {
          groupId: group._id,
          groupName: group.name
        }
        await tutor.save({ session })
      }
    }
    
    // Check both User and Alumni models for student course update
    let student = await User.findById(studentId).session(session)
    let isAlumni = false
    
    if (!student) {
      // If not found in User model, check Alumni model
      student = await Alumni.findById(studentId).session(session)
      isAlumni = true
      
      if (!student) {
        await session.abortTransaction(); session.endSession()
        return res.status(404).json({ status: 'error', message: 'Student/Alumni not found' })
      }
    }
    
    // Update course entry for student/alumni
    if (student && student.courses) {
      const courseEntry = student.courses.find(c => String(c.courseId) === String(group.courseId))
      if (courseEntry) {
        courseEntry.isAssignedToGroup = true
        courseEntry.assignedGroup = {
          groupId: group._id,
          groupName: group.name
        }
        await student.save({ session })
      }
    }
    
    await session.commitTransaction(); session.endSession()
    return res.status(200).json({ 
      status: 'success', 
      data: { group },
      message: `${isAlumni ? 'Alumni' : 'Student'} added to group` 
    })
  } catch (err) {
    await session.abortTransaction(); session.endSession()
    console.error('Add student error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to add student' })
  }
})

// POST /groups/:id/remove-student - UPDATED to check both User and Alumni
router.post('/:id/remove-student', verifyToken, async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const { id } = req.params
    const { studentId } = req.body
    if (!studentId) return res.status(400).json({ status: 'error', message: 'Missing studentId' })
    
    const group = await Group.findById(id).session(session)
    if (!group) {
      await session.abortTransaction(); session.endSession()
      return res.status(404).json({ status: 'error', message: 'Group not found' })
    }
    
    if (req.userType !== 'admin' && String(req.userId) !== String(group.tutorId)) {
      await session.abortTransaction(); session.endSession()
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    
    group.students = (group.students || []).filter(s => String(s.studentId) !== String(studentId))
    await group.save({ session })
    
    // Update tracking on Tutor.myStudents
    const tutor = await Tutor.findById(group.tutorId).session(session)
    if (tutor && tutor.myStudents) {
      const myStudentEntry = tutor.myStudents.find(s => String(s.studentId) === String(studentId))
      if (myStudentEntry) {
        myStudentEntry.isAssignedToGroup = false
        myStudentEntry.assignedGroup = {
          groupId: null,
          groupName: null
        }
        await tutor.save({ session })
      }
    }
    
    // Check both User and Alumni models for student course update
    let student = await User.findById(studentId).session(session)
    
    if (!student) {
      // If not found in User model, check Alumni model
      student = await Alumni.findById(studentId).session(session)
      
      if (!student) {
        await session.abortTransaction(); session.endSession()
        return res.status(404).json({ status: 'error', message: 'Student/Alumni not found' })
      }
    }
    
    // Update course entry for student/alumni
    if (student && student.courses) {
      const courseEntry = student.courses.find(c => String(c.courseId) === String(group.courseId))
      if (courseEntry) {
        courseEntry.isAssignedToGroup = false
        courseEntry.assignedGroup = {
          groupId: null,
          groupName: null
        }
        await student.save({ session })
      }
    }
    
    await session.commitTransaction(); session.endSession()
    return res.status(200).json({ status: 'success', data: { group } })
  } catch (err) {
    await session.abortTransaction(); session.endSession()
    console.error('Remove student error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to remove student' })
  }
})

// POST /groups/transfer - transfer student between groups - UPDATED to check both User and Alumni
router.post('/transfer', verifyToken, async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const { fromGroupId, toGroupId, studentId } = req.body
    if (!fromGroupId || !toGroupId || !studentId) {
      await session.abortTransaction(); session.endSession()
      return res.status(400).json({ status: 'error', message: 'Missing fields' })
    }
    
    const from = await Group.findById(fromGroupId).session(session)
    const to = await Group.findById(toGroupId).session(session)
    if (!from || !to) {
      await session.abortTransaction(); session.endSession()
      return res.status(404).json({ status: 'error', message: 'Group not found' })
    }
    
    if (req.userType !== 'admin' && String(req.userId) !== String(from.tutorId) && String(req.userId) !== String(to.tutorId)) {
      await session.abortTransaction(); session.endSession()
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    
    const student = (from.students || []).find(s => String(s.studentId) === String(studentId))
    if (!student) {
      await session.abortTransaction(); session.endSession()
      return res.status(404).json({ status: 'error', message: 'Student not in source group' })
    }
    
    // Remove from source
    from.students = (from.students || []).filter(s => String(s.studentId) !== String(studentId))
    
    // Add to destination if not present
    if (!(to.students || []).some(s => String(s.studentId) === String(studentId))) {
      to.students.push({ studentId: student.studentId, name: student.name })
    }
    
    await from.save({ session })
    await to.save({ session })
    
    // Update tracking on Tutor.myStudents
    const tutor = await Tutor.findById(from.tutorId).session(session)
    if (tutor && tutor.myStudents) {
      const myStudentEntry = tutor.myStudents.find(s => String(s.studentId) === String(studentId))
      if (myStudentEntry) {
        myStudentEntry.isAssignedToGroup = true
        myStudentEntry.assignedGroup = {
          groupId: to._id,
          groupName: to.name
        }
        await tutor.save({ session })
      }
    }
    
    // Check both User and Alumni models for student course update
    let studentRecord = await User.findById(studentId).session(session)
    
    if (!studentRecord) {
      // If not found in User model, check Alumni model
      studentRecord = await Alumni.findById(studentId).session(session)
      
      if (!studentRecord) {
        await session.abortTransaction(); session.endSession()
        return res.status(404).json({ status: 'error', message: 'Student/Alumni not found' })
      }
    }
    
    // Update course entry for the transfer
    if (studentRecord && studentRecord.courses) {
      const courseEntry = studentRecord.courses.find(c => String(c.courseId) === String(to.courseId))
      if (courseEntry) {
        courseEntry.isAssignedToGroup = true
        courseEntry.assignedGroup = {
          groupId: to._id,
          groupName: to.name
        }
        await studentRecord.save({ session })
      }
    }
    
    await session.commitTransaction(); session.endSession()
    return res.status(200).json({ status: 'success', message: 'Transferred' })
  } catch (err) {
    await session.abortTransaction(); session.endSession()
    console.error('Transfer error:', err)
    return res.status(500).json({ status: 'error', message: 'Transfer failed' })
  }
})

module.exports = router
