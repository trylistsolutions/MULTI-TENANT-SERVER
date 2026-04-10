const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const Application = require('../models/application');
const Student = require('../models/student');
const Course = require('../models/courses');
const bcrypt = require('bcrypt');
const { sendApplicationEmails, sendRejectionEmail, sendAdmissionConfirmationEmail } = require('../utils/emailService');

// Submit a new application
router.post('/', asyncHandler(async (req, res) => {
    console.log('New application submission received:', req.body);
    const {
        firstName,
        lastName,
        dateOfBirth,
        gender,
        religion,
        nationality,
        email,
        phone,
        idPassport,
        course,
        preferredStartDate,
        preferredClassTime,
        emergencyContact,
        additionalInfo,
        marketingConsent 
    } = req.body;

    // Check if application already exists with this ID/Passport
    const existingApplication = await Application.findOne({ idPassport });
    if (existingApplication) {
        return res.status(400).json({
            success: false,
            message: 'An application with this ID/Passport number already exists'
        });
    }

    // Check if application already exists with this email
    const existingEmail = await Application.findOne({ email });
    if (existingEmail) {
        return res.status(400).json({
            success: false,
            message: 'An application with this email already exists'
        });
    }

    // Create new application with additional metadata
    const application = new Application({
        firstName,
        lastName,
        dateOfBirth: new Date(dateOfBirth),
        gender,
        religion,
        nationality,
        email,
        phone,
        idPassport,
        course,
        preferredStartDate: new Date(preferredStartDate),
        preferredClassTime,
        emergencyContact,
        additionalInfo,
        marketingConsent,
        // Capture metadata for tracking
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        source: 'Website Application Form'
    });

    // Save to database
    const savedApplication = await application.save();

    // Send emails (non-blocking, doesn't affect API response)
    try {
        sendApplicationEmails(savedApplication);
        console.log('📧 Email sending initiated for:', savedApplication.applicationNumber);
    } catch (emailError) {
        // Don't fail the request if email fails
        console.error('⚠️ Email sending error (non-fatal):', emailError);
    }

    // Send success response immediately
    res.status(201).json({
        success: true,
        message: 'Application submitted successfully',
        data: {
            applicationNumber: savedApplication.applicationNumber,
            applicationDate: savedApplication.applicationDate,
            status: savedApplication.status,
            _id: savedApplication._id,
            note: 'Confirmation email has been sent to your email address'
        }
    });
}));

// Get all applications with filters
router.get('/', asyncHandler(async (req, res) => {
    const { 
        status, 
        course, 
        startDate, 
        endDate, 
        search,
        page = 1, 
        limit = 20 
    } = req.query;
    
    // Build filter
    const filter = {};
    
    if (status) filter.status = status;
    if (course) filter.course = course;
    
    // Date range filter
    if (startDate || endDate) {
        filter.applicationDate = {};
        if (startDate) filter.applicationDate.$gte = new Date(startDate);
        if (endDate) filter.applicationDate.$lte = new Date(endDate);
    }
    
    // Search filter
    if (search) {
        filter.$or = [
            { firstName: { $regex: search, $options: 'i' } },
            { lastName: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } },
            { idPassport: { $regex: search, $options: 'i' } },
            { applicationNumber: { $regex: search, $options: 'i' } }
        ];
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const applications = await Application.find(filter)
        .sort({ applicationDate: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('-__v');

    const total = await Application.countDocuments(filter);

    res.json({
        success: true,
        count: applications.length,
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        data: applications
    });
}));

// Reject an application - Updated
router.put('/:id/reject', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { rejectionReason, reviewedBy } = req.body;

    console.log('Reject application called for ID:', id);
    console.log('Rejection reason:', rejectionReason);
    console.log('Reviewed by:', reviewedBy);

    const application = await Application.findById(id);
    if (!application) {
        return res.status(404).json({
            success: false,
            message: 'Application not found'
        });
    }

    // Update application status
    application.status = 'Rejected';
    application.rejectionReason = rejectionReason;
    application.reviewedBy = reviewedBy;
    application.reviewDate = new Date();
    application.reviewNotes = `Application rejected: ${rejectionReason}`;

    await application.save();

    // Send rejection email
    try {
        console.log('Attempting to send rejection email to:', application.email);
        await sendRejectionEmail(application);
        console.log('✅ Rejection email sent successfully');
    } catch (emailError) {
        console.error('❌ Failed to send rejection email:', emailError);
        // Don't fail the request if email fails
    }

    res.json({
        success: true,
        message: 'Application rejected successfully',
        data: application
    });
}));

// Admit an application - Updated
router.post('/:id/admit', asyncHandler(async (req, res) => {
    console.log('Admit application called with data:', req.body);
    const { id } = req.params;
    const { 
        academicYear,
        admissionNumber,
        admissionDate,
        upfrontFee,
        actualStartDate,
        courseDuration,
        courseFee,
        courseName,
        courseId,
        admittedBy 
    } = req.body;

    const application = await Application.findById(id);
    if (!application) {
        return res.status(404).json({
            success: false,
            message: 'Application not found'
        });
    }

    // Check if admission number already exists
    const existingStudent = await Student.findOne({ admissionNumber });
    if (existingStudent) {
        return res.status(400).json({
            success: false,
            message: 'Admission number already exists'
        });
    }

    // Check if email already exists in students
    const existingEmail = await Student.findOne({ email: application.email });
    if (existingEmail) {
        return res.status(400).json({
            success: false,
            message: 'Student with this email already exists'
        });
    }

    // Check if national ID already exists in students
    const existingNationalId = await Student.findOne({ nationalId: application.idPassport });
    if (existingNationalId) {
        return res.status(400).json({
            success: false,
            message: 'Student with this ID/Passport already exists'
        });
    }

    // Validate courseId is provided
    if (!courseId) {
        return res.status(400).json({
            success: false,
            message: 'Course ID is required'
        });
    }

    // Fetch course document to get exam scheme
    const courseDoc = await Course.findById(courseId);
    if (!courseDoc) {
        return res.status(404).json({
            success: false,
            message: 'Course not found'
        });
    }

    // Create student from application data
    const studentData = {
        // From application
        firstName: application.firstName,
        lastName: application.lastName,
        dateOfBirth: application.dateOfBirth,
        gender: application.gender,
        religion: application.religion,
        nationality: application.nationality,
        email: application.email,
        phoneNumber: application.phone,
        nationalId: application.idPassport,
        course: courseId,
        startDate: actualStartDate || application.preferredStartDate,
        
        // Emergency contact from application
        emergencyContact: {
            firstName: application.emergencyContact.firstName,
            lastName: application.emergencyContact.lastName,
            relation: application.emergencyContact.relation,
            phone: application.emergencyContact.phone
        },
        
        // Admin provided fields
        academicYear: academicYear || new Date().getFullYear().toString(),
        admissionNumber,
        admissionDate: admissionDate || new Date(),
        upfrontFee: upfrontFee || 0,
        feeUpdates: [{
            amount: upfrontFee || 0,
            previousAmount: 0,
            changeType: "initial",
            timestamp: new Date(),
            note: "Initial admission fee"
        }],
        courseDuration: courseDuration || courseDoc.duration,
        courseFee: parseFloat(courseFee) || courseDoc.fee,
        courseName: courseName || courseDoc.name,
        assignedCohort: actualStartDate || new Date(),
        allotment: 'pending',
        isCertificateReady: false,
        tutorId: '',
        tutorName: '',
        
        // Map exam scheme from course to student exams
        exams: courseDoc.examScheme.map(exam => ({
            name: exam.name,
            weight: exam.weight,
            score: 0
        }))
    };

        // Hash phone number as default password
    if (application.phone) {
        const salt = await bcrypt.genSalt(10);
        studentData.password = await bcrypt.hash(application.phone, salt);
    }

    // Create the student
    const student = new Student(studentData);
    await student.save();

    // Increment course enrolled students count
    courseDoc.enrolledStudents = (courseDoc.enrolledStudents || 0) + 1;
    await courseDoc.save();

    // Send admission confirmation email
    try {
        console.log('Attempting to send admission confirmation email to:', student.email);
        await sendAdmissionConfirmationEmail(student, application);
        console.log('✅ Admission confirmation email sent successfully');
    } catch (emailError) {
        console.error('❌ Failed to send admission confirmation email:', emailError);
        // Don't fail the request if email fails
    }

    // Delete the application
    await Application.findByIdAndDelete(id);

    res.status(201).json({
        success: true,
        message: 'Application admitted successfully and student created',
        data: {
            student: {
                _id: student._id,
                admissionNumber: student.admissionNumber,
                firstName: student.firstName,
                lastName: student.lastName,
                email: student.email
            },
            application: {
                _id: application._id,
                applicationNumber: application.applicationNumber
            }
        }
    });
}));

// Get single application
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const application = await Application.findById(id);
    if (!application) {
        return res.status(404).json({
            success: false,
            message: 'Application not found'
        });
    }

    res.json({
        success: true,
        data: application
    });
}));

// Check if ID/Passport already exists
router.get('/check/:idPassport', asyncHandler(async (req, res) => {
    const application = await Application.findOne({ 
        idPassport: req.params.idPassport 
    });

    res.json({
        success: true,
        exists: !!application,
        data: application ? {
            applicationNumber: application.applicationNumber,
            status: application.status,
            applicationDate: application.applicationDate
        } : null
    });
}));

// Update application status (Admin only)
router.patch('/:id/status', asyncHandler(async (req, res) => {
    const { status, reviewNotes } = req.body;
    
    if (!status || !['Pending', 'Under Review', 'Approved', 'Rejected', 'Waitlisted'].includes(status)) {
        return res.status(400).json({
            success: false,
            message: 'Valid status is required'
        });
    }

    const updateData = {
        status,
        reviewDate: new Date()
    };

    if (reviewNotes) {
        updateData.reviewNotes = reviewNotes;
    }

    // Add reviewer info if authenticated
    if (req.user) {
        updateData.reviewedBy = req.user._id;
    }

    const application = await Application.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
    ).select('-__v');

    if (!application) {
        return res.status(404).json({
            success: false,
            message: 'Application not found'
        });
    }

    res.json({
        success: true,
        message: `Application status updated to ${status}`,
        data: application
    });
}));

// Get application statistics
router.get('/stats/overview', asyncHandler(async (req, res) => {
    const stats = await Application.aggregate([
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);

    const total = await Application.countDocuments();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayCount = await Application.countDocuments({
        applicationDate: { $gte: today }
    });

    const weeklyCount = await Application.countDocuments({
        applicationDate: { $gte: new Date(today - 7 * 24 * 60 * 60 * 1000) }
    });

    res.json({
        success: true,
        data: {
            total,
            today: todayCount,
            last7Days: weeklyCount,
            byStatus: stats.reduce((acc, curr) => {
                acc[curr._id] = curr.count;
                return acc;
            }, {})
        }
    });
}));

module.exports = router;