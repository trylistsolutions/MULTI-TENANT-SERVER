const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const Inquiry = require('../models/inquiry');

// @route   POST /api/inquiries
// @desc    Submit a new inquiry
// @access  Public
router.post('/', asyncHandler(async (req, res) => {
    const {
        name,
        email,
        phone,
        subject,
        message
    } = req.body;

    // Basic validation
    if (!name || !email || !phone || !subject || !message) {
        return res.status(400).json({
            success: false,
            message: 'All fields are required'
        });
    }

    // Create new inquiry
    const inquiry = new Inquiry({
        name,
        email,
        phone,
        subject,
        message,
        // Optional: Capture additional metadata
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        pageUrl: req.get('referer')
    });

    // Save to database
    const savedInquiry = await inquiry.save();

    // TODO: Send notification email to admin
    // TODO: Send auto-response to the inquirer
    // TODO: Integrate with ticketing system if needed

    console.log('New inquiry received:', savedInquiry.inquiryNumber);

    // Send success response
    res.status(201).json({
        success: true,
        message: 'Your inquiry has been submitted successfully',
        data: {
            inquiryNumber: savedInquiry.inquiryNumber,
            inquiryDate: savedInquiry.inquiryDate,
            status: savedInquiry.status
        }
    });
}));

// @route   GET /api/inquiries
// @desc    Get all inquiries (Admin only)
// @access  Private/Admin
router.get('/', asyncHandler(async (req, res) => {
    const { 
        status, 
        inquiryType, 
        startDate, 
        endDate, 
        search,
        page = 1, 
        limit = 20 
    } = req.query;
    
    // Build filter
    const filter = {};
    if (status) filter.status = status;
    if (inquiryType) filter.inquiryType = inquiryType;
    if (startDate || endDate) {
        filter.inquiryDate = {};
        if (startDate) filter.inquiryDate.$gte = new Date(startDate);
        if (endDate) filter.inquiryDate.$lte = new Date(endDate);
    }
    
    // Search filter
    if (search) {
        filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { subject: { $regex: search, $options: 'i' } },
            { message: { $regex: search, $options: 'i' } },
            { inquiryNumber: { $regex: search, $options: 'i' } }
        ];
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const inquiries = await Inquiry.find(filter)
        .sort({ inquiryDate: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('-__v'); // Exclude version key

    const total = await Inquiry.countDocuments(filter);

    res.json({
        success: true,
        count: inquiries.length,
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        data: inquiries
    });
}));

// @route   GET /api/inquiries/:id
// @desc    Get single inquiry by ID
// @access  Private/Admin
router.get('/:id', asyncHandler(async (req, res) => {
    const inquiry = await Inquiry.findById(req.params.id)
        .select('-__v');

    if (!inquiry) {
        return res.status(404).json({
            success: false,
            message: 'Inquiry not found'
        });
    }

    res.json({
        success: true,
        data: inquiry
    });
}));

// @route   PATCH /api/inquiries/:id/status
// @desc    Update inquiry status (Admin only)
// @access  Private/Admin
router.patch('/:id/status', asyncHandler(async (req, res) => {
    const { status, responseNotes, responseMethod } = req.body;
    
    if (!status || !['New', 'In Progress', 'Responded', 'Closed', 'Spam'].includes(status)) {
        return res.status(400).json({
            success: false,
            message: 'Valid status is required'
        });
    }

    const updateData = {
        status,
        responseDate: new Date()
    };

    if (responseNotes) {
        updateData.responseNotes = responseNotes;
    }
    
    if (responseMethod) {
        updateData.responseMethod = responseMethod;
    }

    // Add responder info if authenticated
    if (req.user) {
        updateData.respondedBy = req.user._id;
    }

    const inquiry = await Inquiry.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
    ).select('-__v');

    if (!inquiry) {
        return res.status(404).json({
            success: false,
            message: 'Inquiry not found'
        });
    }

    res.json({
        success: true,
        message: `Inquiry status updated to ${status}`,
        data: inquiry
    });
}));

// @route   GET /api/inquiries/stats/overview
// @desc    Get inquiry statistics
// @access  Private/Admin
router.get('/stats/overview', asyncHandler(async (req, res) => {
    const [statusStats, typeStats, dailyStats] = await Promise.all([
        // Status statistics
        Inquiry.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]),
        
        // Type statistics
        Inquiry.aggregate([
            {
                $group: {
                    _id: '$inquiryType',
                    count: { $sum: 1 }
                }
            }
        ]),
        
        // Last 7 days statistics
        Inquiry.aggregate([
            {
                $match: {
                    inquiryDate: {
                        $gte: new Date(new Date() - 7 * 24 * 60 * 60 * 1000)
                    }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: "%Y-%m-%d", date: "$inquiryDate" }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { _id: 1 }
            }
        ])
    ]);

    const total = await Inquiry.countDocuments();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayCount = await Inquiry.countDocuments({
        inquiryDate: { $gte: today }
    });

    const unreadCount = await Inquiry.countDocuments({
        status: 'New'
    });

    res.json({
        success: true,
        data: {
            total,
            today: todayCount,
            unread: unreadCount,
            byStatus: statusStats.reduce((acc, curr) => {
                acc[curr._id] = curr.count;
                return acc;
            }, {}),
            byType: typeStats.reduce((acc, curr) => {
                acc[curr._id] = curr.count;
                return acc;
            }, {}),
            last7Days: dailyStats
        }
    });
}));

// @route   GET /api/inquiries/search/suggestions
// @desc    Get search suggestions for inquiries
// @access  Private/Admin
router.get('/search/suggestions', asyncHandler(async (req, res) => {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
        return res.json({
            success: true,
            data: []
        });
    }

    const suggestions = await Inquiry.find({
        $or: [
            { name: { $regex: q, $options: 'i' } },
            { email: { $regex: q, $options: 'i' } },
            { subject: { $regex: q, $options: 'i' } },
            { inquiryNumber: { $regex: q, $options: 'i' } }
        ]
    })
    .select('name email subject inquiryNumber inquiryDate')
    .limit(10)
    .sort({ inquiryDate: -1 });

    res.json({
        success: true,
        data: suggestions
    });
}));

module.exports = router;