// Application Routes - Handle student application submissions
const express = require('express');
const router = express.Router();
const Application = require('../models/Application');
const Student = require('../models/Student');
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const bcrypt = require('bcrypt');
const asyncHandler = require('express-async-handler');
const { transporter, generateApplicationConfirmationTemplate, generateStatusChangeTemplate, generateStudentWelcomeTemplate, generateAdminApplicationNotificationTemplate } = require('../config/emailConfig');

// Multer in-memory storage for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Cloudinary config (expects env vars)
cloudinary.config({
    cloud_name: process.env.ZOEZI_CLOUDINARY_CLOUD_NAME,
    api_key: process.env.ZOEZI_CLOUDINARY_API_KEY,
    api_secret: process.env.ZOEZI_CLOUDINARY_API_SECRET,
    secure: true
});

// Helper to upload buffer to Cloudinary
const uploadToCloudinary = (fileBuffer, folder = 'students_profile_pictures') => {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: 'image',
                quality: 'auto:good',
                fetch_format: 'auto',
                width: 400,
                height: 400,
                crop: 'fill',
                gravity: 'face'
            },
            (error, result) => {
                if (error) {
                    console.error('Cloudinary upload error:', error);
                    reject(error);
                } else {
                    resolve(result);
                }
            }
        ).end(fileBuffer);
    });
};

/**
 * POST /api/applications
 * Create a new application and send confirmation email
 */
router.post('/', async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            email,
            phone,
            dateOfBirth,
            gender,
            qualification,
            preferredIntake,
            course,
            citizenship,
            idNumber,
            howHeardAbout,
            otherSource,
            trainingMode,
            preferredStartDate,
            kcseGrade,
            feePayer,
            feePayerPhone,
            nextOfKinName,
            nextOfKinRelationship,
            nextOfKinPhone,
            agreedToTerms
        } = req.body;

        // Validate required fields
        if (!firstName || !lastName || !email || !phone || !dateOfBirth) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required fields'
            });
        }

        // Generate unique application number (format: APP-YYYY-XXXXX)
        const currentYear = new Date().getFullYear();
        const randomNum = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
        const applicationNumber = `APP-${currentYear}-${randomNum}`;

        // Create new application
        const newApplication = new Application({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            dateOfBirth,
            gender,
            qualification,
            preferredIntake,
            course,
            citizenship,
            idNumber,
            howHeardAbout,
            otherSource: otherSource?.trim(),
            trainingMode,
            preferredStartDate,
            kcseGrade,
            feePayer,
            feePayerPhone,
            nextOfKinName,
            nextOfKinRelationship,
            nextOfKinPhone,
            agreedToTerms,
            applicationNumber,
            status: 'pending'
        });

        // Save to database
        const savedApplication = await newApplication.save();

        // Prepare email content
        const emailTemplate = generateApplicationConfirmationTemplate(
            `${firstName} ${lastName}`,
            applicationNumber
        );

        // Send confirmation email
        const mailOptions = {
            from: process.env.ZOEZI_EMAIL,
            to: email,
            subject: `Application Received - Reference #${applicationNumber}`,
            html: emailTemplate
        };

        try {
            await transporter.sendMail(mailOptions);
            // Update emailSent flag
            savedApplication.emailSent = true;
            await savedApplication.save();

            // Send admin notification email
            const adminEmail = process.env.ZOEZI_ADMIN_EMAIL;
            const adminCCEmail = process.env.ZOEZI_ADMIN_CC_EMAIL;
            const adminNotificationTemplate = generateAdminApplicationNotificationTemplate(
                `${firstName} ${lastName}`,
                applicationNumber,
                email,
                phone,
                course,
                new Date().toLocaleString('en-US', { 
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                })
            );

            const adminMailOptions = {
                from: process.env.ZOEZI_EMAIL,
                to: adminEmail,
                cc: adminCCEmail,
                subject: `[NEW APPLICATION] ${firstName} ${lastName} - ${applicationNumber}`,
                html: adminNotificationTemplate
            };

            try {
                await transporter.sendMail(adminMailOptions);
                console.log('Admin notification email sent successfully');
            } catch (adminEmailError) {
                console.error('Failed to send admin notification email:', adminEmailError);
                // Continue - applicant notification was sent
            }

            return res.status(201).json({
                status: 'success',
                message: 'Application submitted successfully. Confirmation email sent.',
                data: {
                    applicationId: savedApplication._id,
                    applicationNumber: savedApplication.applicationNumber,
                    email: savedApplication.email,
                    firstName: savedApplication.firstName,
                    lastName: savedApplication.lastName
                }
            });
        } catch (emailError) {
            console.error('Email sending failed:', emailError);
            // Application saved but email failed
            return res.status(201).json({
                status: 'warning',
                message: 'Application submitted but confirmation email could not be sent.',
                data: {
                    applicationId: savedApplication._id,
                    applicationNumber: savedApplication.applicationNumber,
                    email: savedApplication.email,
                    firstName: savedApplication.firstName,
                    lastName: savedApplication.lastName
                }
            });
        }
    } catch (error) {
        console.error('Application submission error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to submit application',
            error: error.message
        });
    }
});

/**
 * GET /api/applications/:applicationNumber
 * Retrieve a specific application by application number
 */
router.get('/:applicationNumber', async (req, res) => {
    try {
        const { applicationNumber } = req.params;

        const application = await Application.findOne({ applicationNumber });

        if (!application) {
            return res.status(404).json({
                status: 'error',
                message: 'Application not found'
            });
        }

        res.status(200).json({
            status: 'success',
            data: application
        });
    } catch (error) {
        console.error('Error retrieving application:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to retrieve application',
            error: error.message
        });
    }
});

/**
 * GET /api/applications
 * Retrieve all applications (with optional filters)
 */
router.get('/', async (req, res) => {
    try {
        const { status, email, limit = 50, skip = 0 } = req.query;

        // Build query filter
        let filter = {};
        if (status) filter.status = status;
        if (email) filter.email = email.toLowerCase();

        // Retrieve applications with pagination
        const applications = await Application.find(filter)
            .limit(parseInt(limit))
            .skip(parseInt(skip))
            .sort({ createdAt: -1 });

        const total = await Application.countDocuments(filter);

        res.status(200).json({
            status: 'success',
            data: {
                applications,
                pagination: {
                    total,
                    limit: parseInt(limit),
                    skip: parseInt(skip),
                    remaining: Math.max(0, total - (parseInt(skip) + parseInt(limit)))
                }
            }
        });
    } catch (error) {
        console.error('Error retrieving applications:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to retrieve applications',
            error: error.message
        });
    }
});
/**
 * POST /api/applications/:applicationNumber/change-status
 * Change application status (pending | accepted | rejected) with admin note and send email
 */
router.post('/:applicationNumber/change-status', asyncHandler(async (req, res) => {
    const { applicationNumber } = req.params;
    const { newStatus, adminNote, adminName } = req.body;

    const validStatuses = ['pending', 'accepted', 'rejected'];
    if (!newStatus || !validStatuses.includes(newStatus)) {
        return res.status(400).json({ status: 'error', message: `Invalid newStatus. Allowed: ${validStatuses.join(', ')}` });
    }

    const application = await Application.findOne({ applicationNumber });
    if (!application) return res.status(404).json({ status: 'error', message: 'Application not found' });

    // If newStatus is 'accepted' require use of accept endpoint to provide student details
    if (newStatus === 'accepted') {
        return res.status(400).json({ status: 'error', message: 'To accept an application and create a student record, use the /accept endpoint with required student details.' });
    }

    const fromStatus = application.status;

    // Append admin note
    application.adminNotes.push({ note: adminNote || '', admin: adminName || 'Admin', fromStatus, toStatus: newStatus });
    application.status = newStatus;
    application.updatedAt = new Date();

    await application.save();

    // Send status change email
    try {
        const html = generateStatusChangeTemplate(`${application.firstName} ${application.lastName}`, application.applicationNumber, newStatus, adminNote || '');
        await transporter.sendMail({ from: process.env.ZOEZI_EMAIL, to: application.email, subject: `Application ${newStatus.toUpperCase()} - ${application.applicationNumber}`, html });
    } catch (err) {
        console.error('Failed to send status change email:', err);
        // continue; application already updated
    }

    res.status(200).json({ status: 'success', message: 'Application status updated and email sent (if possible)', data: application });
}));


/**
 * POST /api/applications/:applicationNumber/accept
 * Accept application: create Student, upload profile picture, hash password (phone), send welcome email, delete application
 */
router.post('/:applicationNumber/accept', upload.single('profilePicture'), asyncHandler(async (req, res) => {
    const { applicationNumber } = req.params;
    const { admissionNumber, startDate, courseFee, upfrontFee, courseDuration, adminNote, adminName } = req.body;

    const application = await Application.findOne({ applicationNumber });
    if (!application) return res.status(404).json({ status: 'error', message: 'Application not found' });

    // Start transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        let profileUrl = null;
        if (req.file) {
            const uploadResult = await uploadToCloudinary(req.file.buffer);
            profileUrl = uploadResult.secure_url;
        }

        // Hash phone as password
        const saltRounds = parseInt(process.env.ZOEZI_BCRYPT_SALT_ROUNDS || '10');
        const hashedPassword = await bcrypt.hash(application.phone, saltRounds);

        // Parse exams array from form data
        let exams = [];

        if (Array.isArray(req.body.exams)) {
            exams = req.body.exams.map(e => ({
                name: e.name,
                score: Number(e.score) || 0
            }));
        }


        // Transfer all application fields to student data
        const studentData = {
            // Basic info
            firstName: application.firstName,
            lastName: application.lastName,
            email: application.email,
            phone: application.phone,
            password: hashedPassword,
            dateOfBirth: application.dateOfBirth,
            gender: application.gender,

            // Admission info
            admissionNumber: admissionNumber || undefined,
            applicationRef: application.applicationNumber,

            // Education info
            qualification: application.qualification,
            course: application.course,
            trainingMode: application.trainingMode,
            preferredIntake: application.preferredIntake,
            preferredStartDate: application.preferredStartDate,
            startDate: startDate ? new Date(startDate) : application.preferredStartDate ? new Date(application.preferredStartDate) : undefined,

            // Personal details
            citizenship: application.citizenship,
            idNumber: application.idNumber,
            kcseGrade: application.kcseGrade,

            // Application history
            howHeardAbout: application.howHeardAbout,
            otherSource: application.otherSource,

            // Finance
            courseFee: courseFee ? Number(courseFee) : undefined,
            upfrontFee: upfrontFee ? Number(upfrontFee) : undefined,
            feePayer: application.feePayer,
            feePayerPhone: application.feePayerPhone,

            // Emergency contact
            nextOfKinName: application.nextOfKinName,
            nextOfKinRelationship: application.nextOfKinRelationship,
            nextOfKinPhone: application.nextOfKinPhone,

            // Course specific info
            courseDuration: courseDuration || undefined,
            exams: exams.length > 0 ? exams : undefined,

            // Media
            profilePicture: profileUrl
        };

        const newStudent = new Student(studentData);
        await newStudent.save({ session });

        // Append admin note and mark application status
        application.adminNotes.push({ note: adminNote || '', admin: adminName || 'Admin', fromStatus: application.status, toStatus: 'accepted' });
        application.status = 'accepted';
        await application.save({ session });

        // Send welcome email with admission number
        try {
            const html = generateStudentWelcomeTemplate(
                `${newStudent.firstName} ${newStudent.lastName}`,
                newStudent.admissionNumber || newStudent._id.toString(),
                startDate || application.preferredStartDate || '',
                application.course,
                courseFee || '',
                upfrontFee || ''
            );
            await transporter.sendMail({ from: process.env.ZOEZI_EMAIL, to: newStudent.email, subject: `Admission Confirmed - ${newStudent.admissionNumber || newStudent._id}`, html });
        } catch (err) {
            console.error('Failed to send student welcome email:', err);
            // proceed
        }

        // Delete application after successful student creation
        await Application.deleteOne({ _id: application._id }, { session });

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({ status: 'success', message: 'Student created and application removed', data: { studentId: newStudent._id, admissionNumber: newStudent.admissionNumber } });
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error('Error accepting application:', err);
        res.status(500).json({ status: 'error', message: 'Failed to accept application', error: err.message });
    }
}));

/**
 * DELETE /api/applications/:applicationNumber
 * Delete an application completely from the database
 */
router.delete('/:applicationNumber', asyncHandler(async (req, res) => {
    const { applicationNumber } = req.params;

    const application = await Application.findOne({ applicationNumber });
    if (!application) {
        return res.status(404).json({ status: 'error', message: 'Application not found' });
    }

    await Application.deleteOne({ _id: application._id });

    res.status(200).json({
        status: 'success',
        message: `Application ${applicationNumber} has been permanently deleted`,
        data: { applicationNumber }
    });
}));

module.exports = router;
