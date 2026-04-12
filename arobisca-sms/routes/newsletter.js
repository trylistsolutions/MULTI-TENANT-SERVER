const express = require('express');
const router = express.Router();
const Email = require('../models/email');
const Student = require('../models/student');
const Alumni = require('../models/alumni');
const { sendNewsletterEmail } = require('../utils/emailService');
const auth = require('../middleware/auth');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.AROBISCA_SMS_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.AROBISCA_SMS_CLOUDINARY_API_KEY,
  api_secret: process.env.AROBISCA_SMS_CLOUDINARY_API_SECRET,
  secure: true
});

const formatRefNumber = (seq) => {
  const padded = String(seq).padStart(3, '0');
  return `ATC/STU/${padded}`;
};

const getNextRefStart = async () => {
  const count = await Email.countDocuments();
  return count + 1;
};

// Get next reference number
router.get('/next-ref', auth, async (req, res) => {
  try {
    const nextRefStart = await getNextRefStart();
    res.json({ nextRefStart, nextRef: formatRefNumber(nextRefStart) });
  } catch (error) {
    console.error('Error getting next ref:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload admin signature to Cloudinary
router.post('/signature', auth, async (req, res) => {
  try {
    const { imageData } = req.body;

    if (!imageData) {
      return res.status(400).json({ error: 'Signature image is required' });
    }

    const uploadResult = await cloudinary.uploader.upload(imageData, {
      folder: 'admin_signatures',
      resource_type: 'image',
      quality: 'auto:good',
      fetch_format: 'auto'
    });

    res.json({
      signatureUrl: uploadResult.secure_url,
      publicId: uploadResult.public_id
    });
  } catch (error) {
    console.error('Signature upload error:', error);
    res.status(500).json({ error: 'Signature upload failed' });
  }
});

// Send newsletter to batch of students/alumni
router.post('/send-batch', auth, async (req, res) => {
  try {
    const { recipients, emailType, subject, body, templateData } = req.body;
    
    // Validate recipients count
    if (!recipients || recipients.length === 0) {
      return res.status(400).json({ error: 'No recipients provided' });
    }
    
    if (recipients.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 recipients allowed per batch' });
    }
    
    const sentEmails = [];
    const failedEmails = [];
    const nextRefStart = await getNextRefStart();
    
    // Process each recipient
    for (let index = 0; index < recipients.length; index += 1) {
      const recipient = recipients[index];
      try {
        const refNumber = recipient.refNumber || formatRefNumber(nextRefStart + index);
        const emailBody = recipient.body || body;
        const effectiveTemplateData = emailType === 'template'
          ? { ...templateData, refNumber }
          : null;

        const emailDoc = new Email({
          recipientEmail: recipient.email,
          recipientName: recipient.name,
          subject,
          body: emailBody,
          emailType,
          templateData: effectiveTemplateData,
          status: 'pending',
          sentBy: req.user.id || req.user._id
        });
        
        // Send email using nodemailer
        const emailSent = await sendNewsletterEmail(
          recipient.email,
          subject,
          emailBody,
          effectiveTemplateData
        );
        
        if (emailSent.success) {
          emailDoc.status = 'sent';
          emailDoc.sentAt = new Date();
        } else {
          emailDoc.status = 'failed';
          emailDoc.errorMessage = emailSent.error;
          failedEmails.push({
            recipientEmail: recipient.email,
            error: emailSent.error
          });
        }
        
        await emailDoc.save();
        
        if (emailSent.success) {
          sentEmails.push({
            recipientEmail: recipient.email,
            status: 'sent',
            refNumber
          });
        }
      } catch (error) {
        console.error('Error sending to individual recipient:', error);
        failedEmails.push({
          recipientEmail: recipient.email,
          error: error.message
        });
      }
    }
    
    res.json({
      message: 'Batch processing complete',
      totalSent: sentEmails.length,
      totalFailed: failedEmails.length,
      sentEmails,
      failedEmails
    });
    
  } catch (error) {
    console.error('Error in send-batch:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send custom email to single email address
router.post('/send-custom', auth, async (req, res) => {
  try {
    const { recipientEmail, recipientName, subject, body, templateData, emailType } = req.body;
    
    if (!recipientEmail || !subject) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (emailType === 'custom' && !body) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const refNumber = (emailType === 'template')
      ? (templateData && templateData.refNumber ? templateData.refNumber : formatRefNumber(await getNextRefStart()))
      : null;
    const effectiveTemplateData = (emailType === 'template') ? { ...templateData, refNumber } : null;
    
    const emailDoc = new Email({
      recipientEmail,
      recipientName,
      subject,
      body,
      emailType: emailType || 'custom',
      templateData: effectiveTemplateData,
      status: 'pending',
      sentBy: req.user.id || req.user._id
    });
    
    // Send email
    const emailSent = await sendNewsletterEmail(
      recipientEmail,
      subject,
      body,
      effectiveTemplateData
    );
    
    if (emailSent.success) {
      emailDoc.status = 'sent';
      emailDoc.sentAt = new Date();
      await emailDoc.save();
      
      res.json({
        message: 'Email sent successfully',
        status: 'sent',
        emailId: emailDoc._id
      });
    } else {
      emailDoc.status = 'failed';
      emailDoc.errorMessage = emailSent.error;
      await emailDoc.save();
      
      res.status(500).json({
        message: 'Failed to send email',
        error: emailSent.error,
        emailId: emailDoc._id
      });
    }
    
  } catch (error) {
    console.error('Error in send-custom:', error);
    res.status(500).json({ error: error.message });
  }
});

// Retry sending failed email
router.post('/retry/:emailId', auth, async (req, res) => {
  try {
    const emailDoc = await Email.findById(req.params.emailId);
    
    if (!emailDoc) {
      return res.status(404).json({ error: 'Email record not found' });
    }
    
    // Send email again
    const emailSent = await sendNewsletterEmail(
      emailDoc.recipientEmail,
      emailDoc.subject,
      emailDoc.body,
      emailDoc.templateData
    );
    
    if (emailSent.success) {
      emailDoc.status = 'sent';
      emailDoc.sentAt = new Date();
      emailDoc.retryCount += 1;
    } else {
      emailDoc.status = 'failed';
      emailDoc.errorMessage = emailSent.error;
      emailDoc.retryCount += 1;
    }
    
    await emailDoc.save();
    
    res.json({
      message: emailSent.success ? 'Email sent successfully' : 'Failed to send email',
      status: emailDoc.status,
      retryCount: emailDoc.retryCount
    });
    
  } catch (error) {
    console.error('Error in retry:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get students for selection (dropdown)
router.get('/students-list', auth, async (req, res) => {
  try {
    const students = await Student.find({}, 'email firstName lastName admissionNumber courseName startDate courseDuration _id');
    
    const formattedStudents = students.map(student => ({
      _id: student._id,
      email: student.email,
      name: `${student.firstName} ${student.lastName}`,
      admissionNumber: student.admissionNumber,
      courseName: student.courseName,
      startDate: student.startDate,
      courseDuration: student.courseDuration
    }));
    
    res.json(formattedStudents);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get alumni for selection (dropdown)
router.get('/alumni-list', auth, async (req, res) => {
  try {
    const alumni = await Alumni.find({}, 'email firstName lastName admissionNumber courseName graduationDate _id');
    
    const formattedAlumni = alumni.map(alumnus => ({
      _id: alumnus._id,
      email: alumnus.email,
      name: `${alumnus.firstName} ${alumnus.lastName}`,
      admissionNumber: alumnus.admissionNumber,
      courseName: alumnus.courseName,
      graduationDate: alumnus.graduationDate
    }));
    
    res.json(formattedAlumni);
  } catch (error) {
    console.error('Error fetching alumni:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get email history (current month by default)
router.get('/history', auth, async (req, res) => {
  try {
    const { startDate, endDate, status, page = 1 } = req.query;
    const pageSize = 20;
    
    let query = {};
    
    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    } else {
      // Default to current month
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      
      query.createdAt = {
        $gte: startOfMonth,
        $lte: endOfMonth
      };
    }
    
    // Status filter
    if (status) {
      query.status = status;
    }
    
    const total = await Email.countDocuments(query);
    const emails = await Email.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();
    
    res.json({
      emails,
      pagination: {
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / pageSize),
        pageSize
      }
    });
    
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single email details
router.get('/:emailId', auth, async (req, res) => {
  try {
    const email = await Email.findById(req.params.emailId).lean();
    
    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }
    
    res.json(email);
  } catch (error) {
    console.error('Error fetching email:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search emails
router.get('/search/query', auth, async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Search query required' });
    }
    
    const emails = await Email.find({
      $or: [
        { recipientEmail: { $regex: query, $options: 'i' } },
        { recipientName: { $regex: query, $options: 'i' } },
        { subject: { $regex: query, $options: 'i' } }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    
    res.json(emails);
  } catch (error) {
    console.error('Error searching emails:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
