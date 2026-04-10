const express = require('express')
const router = express.Router()
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const Group = require('../models/Group')
const Curriculum = require('../models/Curriculum')

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

// GET /group-curriculum/:groupId - Get group with curriculum items
router.get('/:groupId', verifyToken, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId)
    if (!group) return res.status(404).json({ status: 'error', message: 'Group not found' })
    if (req.userType !== 'admin' && String(req.userId) !== String(group.tutorId)) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    return res.status(200).json({ status: 'success', data: { group } })
  } catch (err) {
    console.error('Get group curriculum error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to fetch group' })
  }
})

// POST /group-curriculum/:groupId/items - Add item to group curriculum
router.post('/:groupId/items', verifyToken, async (req, res) => {
  try {
    const { type, name, description, attachments, releaseDate, releaseTime, dueDate, dueTime } = req.body
    const group = await Group.findById(req.params.groupId)
    
    if (!group) return res.status(404).json({ status: 'error', message: 'Group not found' })
    if (req.userType !== 'admin' && String(req.userId) !== String(group.tutorId)) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    
    if (!type || !name) {
      return res.status(400).json({ status: 'error', message: 'Missing required fields' })
    }
    
    const position = group.curriculumItems?.length || 0
    
    const newItem = {
      position,
      type,
      name,
      description: description || '',
      attachments: Array.isArray(attachments) 
        ? attachments.filter(att => att.type !== 'none' && att.url && att.title)
        : [],
      releaseDate: releaseDate || null,
      releaseTime: releaseTime || '00:00',
      dueDate: dueDate || null,
      dueTime: dueTime || '23:59',
      isReleased: releaseDate ? new Date(releaseDate) <= new Date() : false
    }
    
    if (!group.curriculumItems) group.curriculumItems = []
    group.curriculumItems.push(newItem)
    await group.save()
    
    return res.status(201).json({ status: 'success', data: { group } })
  } catch (err) {
    console.error('Add item error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to add item' })
  }
})

// PUT /group-curriculum/:groupId/items/:itemId - Update item
router.put('/:groupId/items/:itemId', verifyToken, async (req, res) => {
  try {
    const { type, name, description, attachments, releaseDate, releaseTime, dueDate, dueTime, isCompleted } = req.body
    const group = await Group.findById(req.params.groupId)
    
    if (!group) return res.status(404).json({ status: 'error', message: 'Group not found' })
    if (req.userType !== 'admin' && String(req.userId) !== String(group.tutorId)) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    
    const item = group.curriculumItems.id(req.params.itemId)
    if (!item) return res.status(404).json({ status: 'error', message: 'Item not found' })
    
    if (type) item.type = type
    if (name) item.name = name
    if (description !== undefined) item.description = description
    if (attachments !== undefined) {
      item.attachments = Array.isArray(attachments) 
        ? attachments.filter(att => att.type !== 'none' && att.url && att.title)
        : []
    }
    if (releaseDate !== undefined) item.releaseDate = releaseDate
    if (releaseTime !== undefined) item.releaseTime = releaseTime
    if (dueDate !== undefined) item.dueDate = dueDate
    if (dueTime !== undefined) item.dueTime = dueTime
    if (releaseDate !== undefined) item.isReleased = releaseDate ? new Date(releaseDate) <= new Date() : false
    if (isCompleted !== undefined) item.isCompleted = isCompleted
    
    await group.save()
    return res.status(200).json({ status: 'success', data: { group } })
  } catch (err) {
    console.error('Update item error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to update item' })
  }
})

// DELETE /group-curriculum/:groupId/items/:itemId - Delete item
router.delete('/:groupId/items/:itemId', verifyToken, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId)
    
    if (!group) return res.status(404).json({ status: 'error', message: 'Group not found' })
    if (req.userType !== 'admin' && String(req.userId) !== String(group.tutorId)) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    
    const item = group.curriculumItems.id(req.params.itemId)
    if (!item) return res.status(404).json({ status: 'error', message: 'Item not found' })
    
    item.deleteOne()
    await group.save()
    
    return res.status(200).json({ status: 'success', data: { group } })
  } catch (err) {
    console.error('Delete item error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to delete item' })
  }
})

// POST /group-curriculum/:groupId/import-curriculum/:curriculumId - Import entire curriculum
router.post('/:groupId/import-curriculum/:curriculumId', verifyToken, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId)
    const curriculum = await Curriculum.findById(req.params.curriculumId)
    
    if (!group) return res.status(404).json({ status: 'error', message: 'Group not found' })
    if (!curriculum) return res.status(404).json({ status: 'error', message: 'Curriculum not found' })
    
    if (req.userType !== 'admin' && String(req.userId) !== String(group.tutorId)) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    
    if (!group.curriculumItems) group.curriculumItems = []
    
    // Import all items from curriculum
    const startPosition = group.curriculumItems.length
    curriculum.items.forEach((item, index) => {
      group.curriculumItems.push({
        position: startPosition + index,
        type: item.type,
        name: item.name,
        description: item.description,
        attachments: item.attachments || [], // Import multiple attachments
        releaseDate: null,
        releaseTime: '00:00',
        dueDate: null,
        dueTime: '23:59',
        isReleased: false,
        sourceItemId: item._id
      })
    })
    
    await group.save()
    return res.status(200).json({ status: 'success', data: { group } })
  } catch (err) {
    console.error('Import curriculum error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to import curriculum' })
  }
})

// POST /group-curriculum/:groupId/import-item/:curriculumId/:itemId - Import single item
router.post('/:groupId/import-item/:curriculumId/:itemId', verifyToken, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId)
    const curriculum = await Curriculum.findById(req.params.curriculumId)
    
    if (!group) return res.status(404).json({ status: 'error', message: 'Group not found' })
    if (!curriculum) return res.status(404).json({ status: 'error', message: 'Curriculum not found' })
    
    if (req.userType !== 'admin' && String(req.userId) !== String(group.tutorId)) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    
    const currItem = curriculum.items.id(req.params.itemId)
    if (!currItem) return res.status(404).json({ status: 'error', message: 'Item not found' })
    
    if (!group.curriculumItems) group.curriculumItems = []
    
    const position = group.curriculumItems.length
    group.curriculumItems.push({
      position,
      type: currItem.type,
      name: currItem.name,
      description: currItem.description,
      attachments: currItem.attachments || [], // Import multiple attachments
      releaseDate: null,
      releaseTime: '00:00',
      dueDate: null,
      dueTime: '23:59',
      isReleased: false,
      sourceItemId: currItem._id
    })
    
    await group.save()
    return res.status(200).json({ status: 'success', data: { group } })
  } catch (err) {
    console.error('Import item error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to import item' })
  }
})

// POST /group-curriculum/:groupId/reorder - Reorder items
router.post('/:groupId/reorder', verifyToken, async (req, res) => {
  try {
    const { itemOrder } = req.body
    const group = await Group.findById(req.params.groupId)
    
    if (!group) return res.status(404).json({ status: 'error', message: 'Group not found' })
    if (req.userType !== 'admin' && String(req.userId) !== String(group.tutorId)) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    
    if (!Array.isArray(itemOrder)) {
      return res.status(400).json({ status: 'error', message: 'itemOrder must be an array' })
    }
    
    itemOrder.forEach((itemId, index) => {
      const item = group.curriculumItems.id(itemId)
      if (item) item.position = index
    })
    
    group.curriculumItems.sort((a, b) => a.position - b.position)
    await group.save()
    
    return res.status(200).json({ status: 'success', data: { group } })
  } catch (err) {
    console.error('Reorder items error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to reorder items' })
  }
})

module.exports = router
