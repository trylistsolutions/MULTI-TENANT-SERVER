const express = require('express');
const asyncHandler = require('express-async-handler');
const Feedback = require('../models/feedback');
const Student = require('../models/student');
const Alumni = require('../models/alumni');
const router = express.Router();


// @desc    Create new feedback
// @route   POST /feedback
// @access  Private (Student)
router.post('/', asyncHandler(async (req, res) => {
    try {
        const { type, message } = req.body;

        if (!type || !message) {
            return res.status(400).json({
                success: false,
                message: 'Type and message are required'
            });
        }

        // Get student info from token (assuming you store admission number in token)
        const studentAdmissionNumber = req.headers.admissionnumber;
        
        // Find student to get ObjectId
        const student = await Student.findOne({ admissionNumber: studentAdmissionNumber });
        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }

        const feedback = new Feedback({
            student: student._id,
            studentAdmissionNumber,
            type,
            message: message.trim()
        });

        const savedFeedback = await feedback.save();

        res.status(201).json({
            success: true,
            message: 'Feedback submitted successfully',
            data: savedFeedback
        });
    } catch (error) {
        console.error('Error creating feedback:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
}));

// @desc    Get student's feedback
// @route   GET /feedback/student/:admissionNumber
// @access  Private (Student)
router.get('/student/:admissionNumber', asyncHandler(async (req, res) => {
    try {
        const { admissionNumber } = req.params;

        const feedbacks = await Feedback.find({ studentAdmissionNumber: admissionNumber })
            .populate('respondedBy', 'firstName lastName')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: feedbacks
        });
    } catch (error) {
        console.error('Error fetching student feedback:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
}));

// @desc    Update feedback (student can edit only if not read/responded)
// @route   PUT /feedback/:id
// @access  Private (Student)
router.put('/:id', asyncHandler(async (req, res) => {
    try {
        const { type, message } = req.body;
        const feedbackId = req.params.id;
        const studentAdmissionNumber = req.headers.admissionnumber;

        const feedback = await Feedback.findOne({
            _id: feedbackId,
            studentAdmissionNumber
        });

        if (!feedback) {
            return res.status(404).json({
                success: false,
                message: 'Feedback not found'
            });
        }

        // Check if feedback can be edited
        if (feedback.isMarkedRead || feedback.isAdminResponded) {
            return res.status(403).json({
                success: false,
                message: 'Cannot edit feedback that has been read or responded to'
            });
        }

        feedback.type = type || feedback.type;
        feedback.message = message?.trim() || feedback.message;

        const updatedFeedback = await feedback.save();

        res.json({
            success: true,
            message: 'Feedback updated successfully',
            data: updatedFeedback
        });
    } catch (error) {
        console.error('Error updating feedback:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
}));

// @desc    Delete feedback (student can delete only if not read/responded)
// @route   DELETE /feedback/:id
// @access  Private (Student)
router.delete('/:id', asyncHandler(async (req, res) => {
    try {
        const feedbackId = req.params.id;
        const studentAdmissionNumber = req.headers.admissionnumber;

        const feedback = await Feedback.findOne({
            _id: feedbackId,
            studentAdmissionNumber
        });

        if (!feedback) {
            return res.status(404).json({
                success: false,
                message: 'Feedback not found'
            });
        }

        // Check if feedback can be deleted
        if (feedback.isMarkedRead || feedback.isAdminResponded) {
            return res.status(403).json({
                success: false,
                message: 'Cannot delete feedback that has been read or responded to'
            });
        }

        await Feedback.findByIdAndDelete(feedbackId);

        res.json({
            success: true,
            message: 'Feedback deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting feedback:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
}));

// @desc    Get notifications for student
// @route   GET /feedback/notifications/:admissionNumber
// @access  Private (Student)
router.get('/notifications/:admissionNumber', asyncHandler(async (req, res) => {
    try {
        const { admissionNumber } = req.params;

        // Get feedbacks that have updates (read/responded) that student hasn't seen
        const notifications = await Feedback.find({
            studentAdmissionNumber: admissionNumber,
            hasNotificationUpdate: true,
            $or: [
                { isMarkedRead: true },
                { isAdminResponded: true }
            ]
        })
        .populate('respondedBy', 'firstName lastName')
        .sort({ updatedAt: -1 })
        .limit(10);

        res.json({
            success: true,
            data: notifications
        });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
}));

// @desc    Mark notification as seen by student
// @route   PATCH /feedback/mark-seen/:id
// @access  Private (Student)
router.patch('/mark-seen/:id', asyncHandler(async (req, res) => {
    try {
        const feedbackId = req.params.id;
        const studentAdmissionNumber = req.user.admissionNumber;

        const feedback = await Feedback.findOneAndUpdate(
            {
                _id: feedbackId,
                studentAdmissionNumber
            },
            {
                studentHasSeen: true
            },
            { new: true }
        );

        if (!feedback) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        res.json({
            success: true,
            message: 'Notification marked as seen'
        });
    } catch (error) {
        console.error('Error marking notification as seen:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
}));

// @desc    Mark all notifications as seen by student
// @route   PATCH /feedback/mark-all-seen/:admissionNumber
// @access  Private (Student)
router.patch('/mark-all-seen/:admissionNumber', asyncHandler(async (req, res) => {
    try {
        const { admissionNumber } = req.params;

        await Feedback.updateMany(
            {
                studentAdmissionNumber: admissionNumber,
                studentHasSeen: false
            },
            {
                studentHasSeen: true
            }
        );

        res.json({
            success: true,
            message: 'All notifications marked as seen'
        });
    } catch (error) {
        console.error('Error marking all notifications as seen:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
}));

// ========== ADMIN ROUTES (for future use) ==========

// @desc    Get all feedback for admin dashboard
// @route   GET /feedback/admin/all
// @access  Private (Admin)
router.get('/admin/all', asyncHandler(async (req, res) => {
    try {
        const { page = 1, limit = 10, type, status, priority } = req.query;
        
        let query = {};
        if (type) query.type = type;
        if (priority) query.priority = priority;

        if (status) {
            switch (status) {
                case 'pending':
                    query.isMarkedRead = false;
                    query.isAdminResponded = false;
                    break;
                case 'read':
                    query.isMarkedRead = true;
                    query.isAdminResponded = false;
                    break;
                case 'responded':
                    query.isAdminResponded = true;
                    break;
            }
        }

        // Step 1: Fetch feedbacks with student populate
        let feedbacks = await Feedback.find(query)
            .populate('student', 'firstName lastName admissionNumber')
            .populate('respondedBy', 'firstName lastName')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean(); // convert to plain JS objects so we can modify

        // Step 2: For missing student, look into Alumni
        for (let fb of feedbacks) {
            if (!fb.student) {
                const alumni = await Alumni.findOne(
                    { admissionNumber: fb.studentAdmissionNumber },
                    'firstName lastName admissionNumber'
                ).lean();

                if (alumni) {
                    fb.student = alumni; // attach alumni details as student
                    fb.isAlumni = true;  // optional flag for front-end
                } else {
                    fb.student = { firstName: 'Unknown', lastName: '', admissionNumber: fb.studentAdmissionNumber };
                    fb.isAlumni = false;
                }
            } else {
                fb.isAlumni = false;
            }
        }

        const total = await Feedback.countDocuments(query);

        res.json({
            success: true,
            data: {
                feedbacks,
                totalPages: Math.ceil(total / limit),
                currentPage: page,
                total
            }
        });

    } catch (error) {
        console.error('Error fetching admin feedback:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
}));


// @desc    Mark feedback as read (Admin)
// @route   PATCH /feedback/admin/mark-read/:id
// @access  Private (Admin)
router.patch('/admin/mark-read/:id', asyncHandler(async (req, res) => {
    try {
        const feedbackId = req.params.id;

        const feedback = await Feedback.findByIdAndUpdate(
            feedbackId,
            {
                isMarkedRead: true,
                markedReadAt: new Date(),
                markedReadBy: req.headers.adminId, // Assuming admin ID is in token
                studentHasSeen: false, // Trigger notification
                hasNotificationUpdate: true
            },
            { new: true }
        ).populate('student', 'firstName lastName admissionNumber');

        if (!feedback) {
            return res.status(404).json({
                success: false,
                message: 'Feedback not found'
            });
        }

        res.json({
            success: true,
            message: 'Feedback marked as read',
            data: feedback
        });
    } catch (error) {
        console.error('Error marking feedback as read:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
}));

// @desc    Respond to feedback (Admin)
// @route   PATCH /feedback/admin/respond/:id
// @access  Private (Admin)
router.patch('/admin/respond/:id', asyncHandler(async (req, res) => {
    try {
        const feedbackId = req.params.id;
        const { response } = req.body;

        if (!response || !response.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Response is required'
            });
        }

        const feedback = await Feedback.findByIdAndUpdate(
            feedbackId,
            {
                isAdminResponded: true,
                adminResponse: response.trim(),
                respondedBy: req.headers.adminId,
                respondedAt: new Date(),
                isMarkedRead: true, // Auto-mark as read when responding
                markedReadAt: new Date(),
                markedReadBy: req.headers.adminId,
                studentHasSeen: false, // Trigger notification
                hasNotificationUpdate: true
            },
            { new: true }
        ).populate('student', 'firstName lastName admissionNumber')
         .populate('respondedBy', 'firstName lastName');

        if (!feedback) {
            return res.status(404).json({
                success: false,
                message: 'Feedback not found'
            });
        }

        res.json({
            success: true,
            message: 'Response sent successfully',
            data: feedback
        });
    } catch (error) {
        console.error('Error responding to feedback:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
}));

// @desc    Get feedback statistics for admin dashboard
// @route   GET /feedback/admin/stats
// @access  Private (Admin)
router.get('/admin/stats', asyncHandler(async (req, res) => {
    try {
        const totalFeedback = await Feedback.countDocuments();
        const pendingFeedback = await Feedback.countDocuments({
            isMarkedRead: false,
            isAdminResponded: false
        });
        const readFeedback = await Feedback.countDocuments({
            isMarkedRead: true,
            isAdminResponded: false
        });
        const respondedFeedback = await Feedback.countDocuments({
            isAdminResponded: true
        });

        // Feedback by type
        const feedbackByType = await Feedback.aggregate([
            {
                $group: {
                    _id: '$type',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Feedback by priority
        const feedbackByPriority = await Feedback.aggregate([
            {
                $group: {
                    _id: '$priority',
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                totalFeedback,
                pendingFeedback,
                readFeedback,
                respondedFeedback,
                feedbackByType,
                feedbackByPriority
            }
        });
    } catch (error) {
        console.error('Error fetching feedback stats:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
}));

module.exports = router;