const express = require('express')
const router = express.Router()
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const Curriculum = require('../models/Curriculum')
const Tutor = require('../models/Tutor')
const Course = require('../models/Course')

const JWT_SECRET = process.env.ZOEZI_JWT_SECRET || 'zoezi_secret'


// GET /curriculums/courses/available - get courses that don't have curriculums yet
router.get('/courses/available', async (req, res) => {
  try {
    // Get all courses
    const allCourses = await Course.find({ isArchived: false }).lean()
    
    // Get all curricula to find which courses already have curriculums
    const curriculums = await Curriculum.find().select('courseId').lean()
    const curriculumCourseIds = curriculums.map(c => String(c.courseId))
    
    // Filter courses that don't have curriculums
    const availableCourses = allCourses.filter(c => !curriculumCourseIds.includes(String(c._id)))
    
    return res.status(200).json({ status: 'success', data: { courses: availableCourses } })
  } catch (err) {
    console.error('Get available courses error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to fetch courses' })
  }
})

// GET /curriculums/courses/all - get all courses
router.get('/courses/all', async (req, res) => {
  try {
    const allCourses = await Course.find({ isArchived: false }).lean()
    return res.status(200).json({ status: 'success', data: { courses: allCourses } })
  } catch (err) {
    console.error('Get courses error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to fetch courses' })
  }
})

// GET /curriculums - list all curriculums
router.get('/', async (req, res) => {
  try {
    const curriculums = await Curriculum.find().lean()
    return res.status(200).json({ status: 'success', data: { curriculums } })
  } catch (err) {
    console.error('Get curriculums error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to fetch curriculums' })
  }
})

// GET /curriculums/:id - get single curriculum with items
router.get('/:id', async (req, res) => {
  try {
    const curriculum = await Curriculum.findById(req.params.id)
    if (!curriculum) return res.status(404).json({ status: 'error', message: 'Curriculum not found' })
    
    return res.status(200).json({ status: 'success', data: { curriculum } })
  } catch (err) {
    console.error('Get curriculum error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to fetch curriculum' })
  }
})

// POST /curriculums - create curriculum for a course
router.post('/', async (req, res) => {
  try {
    const { courseId } = req.body
    
    if (!courseId) return res.status(400).json({ status: 'error', message: 'Missing courseId' })
    
    // Check if curriculum already exists for this course
    const existing = await Curriculum.findOne({ courseId })
    if (existing) {
      return res.status(409).json({ status: 'error', message: 'Curriculum already exists for this course' })
    }
    
    // Get course name
    const course = await Course.findById(courseId).lean()
    const courseName = course?.name || 'Unknown Course'
    
    const curriculum = await Curriculum.create({
      courseId,
      courseName,
      items: []
    })
    
    return res.status(201).json({ status: 'success', data: { curriculum } })
  } catch (err) {
    console.error('Create curriculum error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to create curriculum' })
  }
})

// DELETE /curriculums/:id - delete curriculum
router.delete('/:id', async (req, res) => {
  try {
    const curriculum = await Curriculum.findById(req.params.id)
    if (!curriculum) return res.status(404).json({ status: 'error', message: 'Curriculum not found' })
    
    await Curriculum.findByIdAndDelete(req.params.id)
    return res.status(200).json({ status: 'success', message: 'Curriculum deleted' })
  } catch (err) {
    console.error('Delete curriculum error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to delete curriculum' })
  }
})

// POST /curriculums/:id/items - add item to curriculum
router.post('/:id/items', async (req, res) => {
  try {
    const { type, name, description, attachments } = req.body // Changed from attachmentUrl, attachmentType
    const curriculum = await Curriculum.findById(req.params.id)
    
    if (!curriculum) return res.status(404).json({ status: 'error', message: 'Curriculum not found' })
    
    if (!type || !name) {
      return res.status(400).json({ status: 'error', message: 'Missing required fields' })
    }
    
    // Calculate position (add at end)
    const position = curriculum.items?.length || 0
    
    const newItem = {
      position,
      type,
      name,
      description: description || '',
      attachments: Array.isArray(attachments) 
        ? attachments.filter(att => att.type !== 'none' && att.url && att.title)
        : [] // Accept array of attachments
    }
    
    curriculum.items.push(newItem)
    await curriculum.save()
    
    return res.status(201).json({ status: 'success', data: { curriculum } })
  } catch (err) {
    console.error('Add item error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to add item' })
  }
})

// PUT /curriculums/:id/items/:itemId - update item
router.put('/:id/items/:itemId', async (req, res) => {
  try {
    const { type, name, description, attachments } = req.body // Changed from attachmentUrl, attachmentType
    const curriculum = await Curriculum.findById(req.params.id)
    
    if (!curriculum) return res.status(404).json({ status: 'error', message: 'Curriculum not found' })
    
    const item = curriculum.items.id(req.params.itemId)
    if (!item) return res.status(404).json({ status: 'error', message: 'Item not found' })
    
    if (type) item.type = type
    if (name) item.name = name
    if (description !== undefined) item.description = description
    if (attachments !== undefined) {
      item.attachments = Array.isArray(attachments) 
        ? attachments.filter(att => att.type !== 'none' && att.url && att.title)
        : []
    }
    
    await curriculum.save()
    return res.status(200).json({ status: 'success', data: { curriculum } })
  } catch (err) {
    console.error('Update item error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to update item' })
  }
})

// DELETE /curriculums/:id/items/:itemId - delete item
router.delete('/:id/items/:itemId', async (req, res) => {
  try {
    const curriculum = await Curriculum.findById(req.params.id)
    
    if (!curriculum) return res.status(404).json({ status: 'error', message: 'Curriculum not found' })
    
    const item = curriculum.items.id(req.params.itemId)
    if (!item) return res.status(404).json({ status: 'error', message: 'Item not found' })
    
    item.deleteOne()
    await curriculum.save()
    
    return res.status(200).json({ status: 'success', data: { curriculum } })
  } catch (err) {
    console.error('Delete item error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to delete item' })
  }
})

// POST /curriculums/:id/reorder - reorder items by positions
router.post('/:id/reorder', async (req, res) => {
  try {
    const { itemOrder } = req.body // array of item IDs in new order
    const curriculum = await Curriculum.findById(req.params.id)
    
    if (!curriculum) return res.status(404).json({ status: 'error', message: 'Curriculum not found' })
    
    if (!Array.isArray(itemOrder)) {
      return res.status(400).json({ status: 'error', message: 'itemOrder must be an array' })
    }
    
    // Update positions based on new order
    itemOrder.forEach((itemId, index) => {
      const item = curriculum.items.id(itemId)
      if (item) item.position = index
    })
    
    // Sort items by position
    curriculum.items.sort((a, b) => a.position - b.position)
    await curriculum.save()
    
    return res.status(200).json({ status: 'success', data: { curriculum } })
  } catch (err) {
    console.error('Reorder items error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to reorder items' })
  }
})

// POST /curriculums/migrate/remove-tutor-id - remove tutorId from all curriculums
router.post('/migrate/remove-tutor-id', async (req, res) => {
  try {
    // Find all curriculums with tutorId field
    const result = await Curriculum.updateMany(
      { tutorId: { $exists: true } },
      { $unset: { tutorId: '' } }
    )

    return res.status(200).json({ 
      status: 'success', 
      message: 'Migration completed',
      data: {
        modifiedCount: result.modifiedCount,
        matchedCount: result.matchedCount
      }
    })
  } catch (err) {
    console.error('Migration error:', err)
    return res.status(500).json({ status: 'error', message: 'Migration failed' })
  }
})

module.exports = router
