const express = require('express');
const router = express.Router();
const Forum = require('../models/forum');
const Tutor = require('../models/tutors');
const Admin = require('../models/admin');
const asyncHandler = require('express-async-handler');
const protect = require("../middleware/auth");

// Get all forums (with optional filtering)
router.get('/', asyncHandler(async (req, res) => {
    try {
        const { type, priority, active } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        // Build filter object
        const filter = {};

        if (type) filter.type = type;
        if (priority) filter.priority = priority;
        if (active !== undefined) filter.isActive = active === 'true';

        // Exclude expired forums unless specifically requested
        if (req.query.includeExpired !== 'true') {
            filter.$or = [
                { expiryDate: null },
                { expiryDate: { $gt: new Date() } }
            ];
        }

        const forums = await Forum.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Forum.countDocuments(filter);

        res.json({
            success: true,
            forums,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching forums:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch forums',
            error: error.message
        });
    }
}));

// Get single forum by ID
router.get('/:id', asyncHandler(async (req, res) => {
    try {
        const forum = await Forum.findById(req.params.id);

        if (!forum) {
            return res.status(404).json({
                success: false,
                message: 'Forum not found'
            });
        }

        res.json({
            success: true,
            forum
        });
    } catch (error) {
        console.error('Error fetching forum:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch forum',
            error: error.message
        });
    }
}));

// Create new forum
router.post('/', asyncHandler(async (req, res) => {
    try {
        const { title, description, type, priority, expiryDate, createdBy } = req.body;

        // Validate required fields
        if (!title || !description || !createdBy) {
            return res.status(400).json({
                success: false,
                message: 'Title, description, and createdBy are required'
            });
        }

        // Validate user role
        if (!['admin', 'tutor'].includes(createdBy.role)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user role'
            });
        }

        const forum = new Forum({
            title,
            description,
            type: type || 'discussion',
            priority: priority || 'normal',
            expiryDate: expiryDate || null,
            createdBy,
            replies: []
        });

        await forum.save();

        res.status(201).json({
            success: true,
            message: 'Forum created successfully',
            forum
        });
    } catch (error) {
        console.error('Error creating forum:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create forum',
            error: error.message
        });
    }
}));

// Add reply to forum
router.post('/:id/replies', asyncHandler(async (req, res) => {
    try {
        const { message, author } = req.body;

        if (!message || !author) {
            return res.status(400).json({
                success: false,
                message: 'Message and author are required'
            });
        }

        // Validate author role
        if (!['admin', 'tutor'].includes(author.role)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid author role'
            });
        }

        const forum = await Forum.findById(req.params.id);

        if (!forum) {
            return res.status(404).json({
                success: false,
                message: 'Forum not found'
            });
        }

        // Check if forum can accept replies
        if (!forum.canReply()) {
            return res.status(400).json({
                success: false,
                message: 'Cannot add reply to expired or inactive forum'
            });
        }

        const reply = {
            message,
            author
        };

        forum.replies.push(reply);
        await forum.save();

        // Get the newly added reply (last one in array)
        const newReply = forum.replies[forum.replies.length - 1];

        res.status(201).json({
            success: true,
            message: 'Reply added successfully',
            reply: newReply
        });
    } catch (error) {
        console.error('Error adding reply:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add reply',
            error: error.message
        });
    }
}));

// Update forum (admin only)
router.put('/:id', asyncHandler(async (req, res) => {
    try {
        const { title, description, type, priority, expiryDate, isActive } = req.body;

        const forum = await Forum.findById(req.params.id);

        if (!forum) {
            return res.status(404).json({
                success: false,
                message: 'Forum not found'
            });
        }

        if (title) forum.title = title;
        if (description) forum.description = description;
        if (type) forum.type = type;
        if (priority) forum.priority = priority;
        if (expiryDate !== undefined) forum.expiryDate = expiryDate;
        if (isActive !== undefined) forum.isActive = isActive;

        await forum.save();

        res.json({
            success: true,
            message: 'Forum updated successfully',
            forum
        });
    } catch (error) {
        console.error('Error updating forum:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update forum',
            error: error.message
        });
    }
}));

// Delete forum (admin only)
router.delete('/:id', asyncHandler(async (req, res) => {
    try {
        const forum = await Forum.findByIdAndDelete(req.params.id);

        if (!forum) {
            return res.status(404).json({
                success: false,
                message: 'Forum not found'
            });
        }

        res.json({
            success: true,
            message: 'Forum deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting forum:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete forum',
            error: error.message
        });
    }
}));

// Get forums by user
router.get('/user/:userId', asyncHandler(async (req, res) => {
    try {
        const { userId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const forums = await Forum.find({
            $or: [
                { 'createdBy.id': userId },
                { 'replies.author.id': userId }
            ]
        })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Forum.countDocuments({
            $or: [
                { 'createdBy.id': userId },
                { 'replies.author.id': userId }
            ]
        });

        res.json({
            success: true,
            forums,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching user forums:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user forums',
            error: error.message
        });
    }
}));

// Mark forum as resolved
router.patch('/:id/resolve', protect, asyncHandler(async (req, res) => {
    try {
        const forum = await Forum.findById(req.params.id);

        if (!forum) {
            return res.status(404).json({
                success: false,
                message: 'Forum not found'
            });
        }

        forum.status = 'resolved';
        forum.resolvedAt = new Date();
        forum.resolvedBy = {
            id: req.user.id,
            name: req.user.name,
            role: req.user.role
        };

        await forum.save();

        res.json({
            success: true,
            message: 'Forum marked as resolved',
            forum
        });
    } catch (error) {
        console.error('Error resolving forum:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to resolve forum',
            error: error.message
        });
    }
}));

// Reopen forum
router.patch('/:id/reopen',  asyncHandler(async (req, res) => {
    try {
        const forum = await Forum.findById(req.params.id);

        if (!forum) {
            return res.status(404).json({
                success: false,
                message: 'Forum not found'
            });
        }

        forum.status = 'open';
        forum.resolvedAt = null;
        forum.resolvedBy = null;

        await forum.save();

        res.json({
            success: true,
            message: 'Forum reopened',
            forum
        });
    } catch (error) {
        console.error('Error reopening forum:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reopen forum',
            error: error.message
        });
    }
}));

// Close forum (admin only)
router.patch('/:id/close', protect, asyncHandler(async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Only admins can close forums'
            });
        }

        const forum = await Forum.findById(req.params.id);

        if (!forum) {
            return res.status(404).json({
                success: false,
                message: 'Forum not found'
            });
        }

        forum.status = 'closed';
        forum.resolvedAt = new Date();
        forum.resolvedBy = {
            id: req.user.id,
            name: req.user.name,
            role: req.user.role
        };

        await forum.save();

        res.json({
            success: true,
            message: 'Forum closed',
            forum
        });
    } catch (error) {
        console.error('Error closing forum:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to close forum',
            error: error.message
        });
    }
}));

// Add tags to forum
router.patch('/:id/tags', asyncHandler(async (req, res) => {
    try {
        const { tags } = req.body;

        const forum = await Forum.findById(req.params.id);

        if (!forum) {
            return res.status(404).json({
                success: false,
                message: 'Forum not found'
            });
        }

        forum.tags = [...new Set([...forum.tags, ...tags])]; // Remove duplicates
        await forum.save();

        res.json({
            success: true,
            message: 'Tags updated',
            forum
        });
    } catch (error) {
        console.error('Error updating tags:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update tags',
            error: error.message
        });
    }
}));

// Mark forum as read/viewed by a user
router.post('/:id/mark-read', asyncHandler(async (req, res) => {
    try {
        const { userId, userName, userRole, profileImage } = req.body;

        if (!userId || !userName || !userRole) {
            return res.status(400).json({
                success: false,
                message: 'userId, userName, and userRole are required'
            });
        }

        const forum = await Forum.findById(req.params.id);

        if (!forum) {
            return res.status(404).json({
                success: false,
                message: 'Forum not found'
            });
        }

        // Check if user already viewed this forum
        const alreadyViewed = forum.views.some(view => view.userId.toString() === userId);

        if (!alreadyViewed) {
            forum.views.push({
                userId,
                userName,
                userRole,
                profileImage: profileImage || null,
                viewedAt: new Date()
            });
            await forum.save();
        }

        res.json({
            success: true,
            message: 'Forum marked as read',
            forum
        });
    } catch (error) {
        console.error('Error marking forum as read:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark forum as read',
            error: error.message
        });
    }
}));

// Get unread forums count for a user
router.get('/unread/count/:userId', asyncHandler(async (req, res) => {
    try {
        const { userId } = req.params;

        const totalForums = await Forum.countDocuments({
            isActive: true,
            $or: [
                { expiryDate: null },
                { expiryDate: { $gt: new Date() } }
            ]
        });

        const readForums = await Forum.countDocuments({
            isActive: true,
            'views.userId': userId,
            $or: [
                { expiryDate: null },
                { expiryDate: { $gt: new Date() } }
            ]
        });

        const unreadCount = totalForums - readForums;

        res.json({
            success: true,
            data: {
                total: totalForums,
                read: readForums,
                unread: unreadCount
            }
        });
    } catch (error) {
        console.error('Error getting unread count:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get unread count',
            error: error.message
        });
    }
}));

// Get unread forums for a user
router.get('/unread/:userId', asyncHandler(async (req, res) => {
    try {
        const { userId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const unreadForums = await Forum.find({
            isActive: true,
            'views.userId': { $ne: userId },
            $or: [
                { expiryDate: null },
                { expiryDate: { $gt: new Date() } }
            ]
        })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Forum.countDocuments({
            isActive: true,
            'views.userId': { $ne: userId },
            $or: [
                { expiryDate: null },
                { expiryDate: { $gt: new Date() } }
            ]
        });

        res.json({
            success: true,
            forums: unreadForums,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching unread forums:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch unread forums',
            error: error.message
        });
    }
}));

module.exports = router;