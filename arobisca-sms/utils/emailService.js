const nodemailer = require('nodemailer');

const arobiscaEmailUser = process.env.AROBISCA_SMS_EMAIL;
const arobiscaEmailPassword = process.env.AROBISCA_SMS_EMAIL_PASSWORD;

// Create transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    port: 465,
    secure: true,
    logger: true,
    debug: false,
    secureConnection: false,
    auth: {
        user: arobiscaEmailUser,
        pass: arobiscaEmailPassword,
    },
    tls: {
        rejectUnauthorized: true
    }
});

// Verify transporter configuration
transporter.verify(function (error, success) {
    if (error) {
        console.error('Email transporter verification failed:', error);
    } else {
        console.log('Email server is ready to send messages');
    }
});

// Application confirmation email template for applicant
const generateApplicationConfirmationTemplate = (applicantName, applicationNumber, course, preferredClassTime, preferredStartDate) => {
    const formattedStartDate = new Date(preferredStartDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Application Confirmation - Arobisca Training Center</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', sans-serif;
            background-color: #f9f5f0;
            line-height: 1.6;
            color: #288733;
        }

        a {
            color: #fff;
            font-weight: 600;
        }
        
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(44, 24, 16, 0.1);
        }
        
        .header {
            background: linear-gradient(135deg, #288733 0%, #6cb26f 100%);
            padding: 40px 30px;
            text-align: center;
            border-bottom: 4px solid #4f3320;
        }

                .header h1 {
            color: white;
}
        
        .logo-container {
            margin-bottom: 20px;
        }
        
        .logo-text {
            color: #fff;
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 10px;
            letter-spacing: 1px;
            text-transform: uppercase;
        }
        
        .subtitle {
            color: rgba(255, 255, 255, 0.9);
            font-size: 16px;
            font-weight: 400;
            letter-spacing: 0.5px;
        }
        
        .content {
            padding: 40px 30px;
        }
        
        .greeting {
            color: #288733;
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 20px;
            border-bottom: 2px solid #f2e6d9;
            padding-bottom: 15px;
        }
        
        .message {
            color: #5d4037;
            font-size: 16px;
            margin-bottom: 25px;
            line-height: 1.8;
        }

        .message span {
        font-weight: 600;
        }
        
        .application-number {
            background: #fff;
            color: #4f3320;
            font-size: 18px;
            font-weight: 700;
            text-align: center;
            padding: 20px;
            border-radius: 8px;
            margin: 30px 0;
            box-shadow: 0 4px 12px rgba(44, 24, 16, 0.15);
            letter-spacing: 2px;
            border: 2px solid #4f3320;
        }
        
        .info-section {
            background: #f9f5f0;
            padding: 25px;
            border-radius: 8px;
            border-left: 4px solid #288733;
            margin: 30px 0;
        }
        
        .info-section h3 {
            color: #288733;
            margin-bottom: 20px;
            font-size: 18px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .info-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 12px;
            padding-bottom: 12px;
            border-bottom: 1px solid #e0d4c4;
        }
        
        .info-item:last-child {
            border-bottom: none;
            margin-bottom: 0;
            padding-bottom: 0;
        }
        
        .info-label {
            color: #288733;
            font-weight: 600;
            min-width: 200px;
        }
        
        .info-value {
            color: #5d4037;
            text-align: right;
            flex: 1;
        }
        
        .important-notice {
            background: #e8f5e9;
            border: 2px solid #4caf50;
            border-radius: 8px;
            padding: 25px;
            margin: 30px 0;
        }
        
        .important-notice h3 {
            color: #288733;
            margin-bottom: 15px;
            font-size: 18px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .important-notice ul {
            padding-left: 20px;
        }
        
        .important-notice li {
            margin-bottom: 10px;
            color: #288733;
            line-height: 1.6;
        }
        
        .important-notice strong {
            color: #d32f2f;
        }
        
        .payment-info {
            background: #fff8e1;
            border: 2px solid #ffc107;
            border-radius: 8px;
            padding: 25px;
            margin: 30px 0;
        }
        
        .payment-info h3 {
            color: #288733;
            margin-bottom: 15px;
            font-size: 18px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .contact-section {
            background: #e3f2fd;
            border: 2px solid #2196f3;
            border-radius: 8px;
            padding: 25px;
            margin: 30px 0;
            text-align: center;
        }
        
        .contact-section h3 {
            color: #288733;
            margin-bottom: 15px;
            font-size: 18px;
        }
        
        .contact-info {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-top: 20px;
        }
        
        .contact-item {
            text-align: center;
            padding: 15px;
            background: white;
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .contact-item strong {
            display: block;
            color: #288733;
            margin-bottom: 5px;
        }
        
        .footer {
            text-align: center;
            padding: 30px;
            background: #288733;
            color: #ffffff;
            border-top: 4px solid #4f3320;
        }
        
        .footer-text {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.8);
            margin-bottom: 10px;
        }
        
        .contact {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.8);
        }
        
        .contact a {
            color: #4f3320;
            text-decoration: none;
        }
        
        .contact a:hover {
            text-decoration: underline;
        }
        
        .social {
        width: 100%;
            display: flex;
            justify-content: center;
            gap: 20px;
            margin: 20px;
        }
        
        @media (max-width: 600px) {
            .container {
                margin: 10px;
            }
            
            .header, .content {
                padding: 30px 20px;
            }
            
            .application-number {
                font-size: 16px;
                padding: 15px;
                letter-spacing: 1px;
            }
            
            .info-item {
                flex-direction: column;
                gap: 5px;
            }
            
            .info-label, .info-value {
                text-align: left;
            }
            
            .contact-info {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo-container">
                <div class="logo-text">AROBISCA TRAINING CENTER</div>
                <div class="subtitle">Professional Coffee Training & Certification</div>
            </div>
        </div>
        
        <div class="content">
            <h1 class="greeting">Application Received! ✅</h1>
            
            <p class="message">
                Dear <strong>${applicantName}</strong>,
            </p>
            
            <p class="message">
                Thank you for applying to Arobisca Training Center! We are excited about your interest in our 
                <strong>${course}</strong> program. Your application has been successfully submitted and is now being processed.
            </p>
            
            <div class="application-number">
                Application Reference: ${applicationNumber}
            </div>
            
            <div class="info-section">
                <h3>📋 Application Details</h3>
                <div class="info-item">
                    <span class="info-label">Application Number:</span>
                    <span class="info-value">${applicationNumber}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Course Applied:</span>
                    <span class="info-value">${course}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Preferred Class Time:</span>
                    <span class="info-value">${preferredClassTime}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Preferred Start Date:</span>
                    <span class="info-value">${formattedStartDate}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Application Status:</span>
                    <span class="info-value">Under Review</span>
                </div>
            </div>
            
            <div class="important-notice">
                <h3>📢 &nbsp; Important Information</h3>
                <ul>
                    <li><strong>Classes Begin Every Monday</strong> - please select your Preferred Class Time via the form</li>
                    <li><strong>Note: Applications are only approved after payment</strong></li>
                    <li>Our admissions team will review your application within 2-3 business days</li>
                    <li>Keep this application number for all future communications</li>
                </ul>
            </div>
            
            <div class="payment-info">
                <h3>💳 &nbsp; Payment Information</h3>
                <p class="message">
                    <span>Bank:</span> &nbsp; KCB BANK KENYA<br>
                    <span>Account No:</span> &nbsp; 1287498361<br>
                    <span>Account Name:</span> &nbsp; AROBISCA GROUP LTD<br>
                </p>
                <p class="message">
                    Please include your admission number as the reference when making payments.
                </p>
            </div>
            
            <div class="contact-section">
                <h3>📞 &nbsp; Need Assistance?</h3>
                <p class="message">
                    If you have any further questions, please don't hesitate to contact us:
                </p>
                <div class="contact-info">
                    <div class="contact-item">
                        <strong>Phone</strong>
                        <div>+254 781 726 674</div>
                        <div>+254 724 637 787</div>
                    </div>
                    <div class="contact-item">
                        <strong>Email</strong>
                        <div>info@arobiscatrainingcenter.co.ke</div>
                        <div>admissions@arobiscatrainingcenter.co.ke</div>
                    </div>
                </div>
            </div>
            
            <p class="message" style="text-align: center; margin-top: 40px;">
                Best Regards,<br>
                <strong>Arobisca Training Center Admissions Team</strong>
            </p>
        </div>
        
        <div class="footer">
            <p class="footer-text">AROBISCA TRAINING CENTER</p>
            <p class="footer-text">Muindi Mbingu Street, Eco Bank Towers, 5th floor, Nairobi, Kenya</p>
            <p class="contact">
                Email: <a href="mailto:info@arobiscatrainingcenter.co.ke">info@arobiscatrainingcenter.co.ke</a> | 
                Phone: <a href="tel:+254781726674">+254 781 726 674</a>
            </p>
            <p class="footer-text" style="margin-top: 15px;">
                &copy; ${new Date().getFullYear()} Arobisca Training Center. All rights reserved.
            </p>
        </div>
    </div>
</body>
</html>`;
};

// Admin notification email template
const generateAdminNotificationTemplate = (application) => {
    const formattedDate = new Date(application.applicationDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const marketingConsentText = application.marketingConsent
        ? '<span style="color: #4caf50; font-weight: 600;">✓ GRANTED</span>'
        : '<span style="color: #d32f2f; font-weight: 600;">✗ DECLINED</span>';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Application Submitted - Arobisca Training Center</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', sans-serif;
            background-color: #f5f5f5;
            line-height: 1.6;
            color: #333;
        }
        
        .container {
            max-width: 700px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        
        .header {
            background: linear-gradient(135deg, #288733 0%, #6cb26f 100%);
            padding: 30px;
            text-align: center;
            border-bottom: 4px solid #4f3320;
        }
        
        .header h1 {
            color: white;
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 10px;
        }
        
        .header p {
            color: rgba(255, 255, 255, 0.9);
            font-size: 14px;
        }
        
        .content {
            padding: 30px;
        }
        
        .alert-banner {
            background: #ffeb3b;
            color: #288733;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 25px;
            text-align: center;
            font-weight: 600;
            border: 2px solid #ffc107;
        }
        
        .application-summary {
            background: #f9f5f0;
            padding: 25px;
            border-radius: 8px;
            margin-bottom: 25px;
            border: 2px solid #288733;
        }
        
        .summary-item {
            display: flex;
            margin-bottom: 12px;
            padding-bottom: 12px;
            border-bottom: 1px solid #e0d4c4;
        }
        
        .summary-item:last-child {
            border-bottom: none;
            margin-bottom: 0;
            padding-bottom: 0;
        }
        
        .summary-label {
            font-weight: 600;
            color: #288733;
            min-width: 180px;
        }
        
        .summary-value {
            color: #5d4037;
            flex: 1;
        }
        
        .section {
            margin: 30px 0;
            padding: 25px;
            border-radius: 8px;
        }
        
        .personal-info {
            background: #e8f5e9;
            border: 2px solid #4caf50;
        }
        
        .course-info {
            background: #e3f2fd;
            border: 2px solid #2196f3;
        }
        
        .contact-info {
            background: #f3e5f6;
            border: 2px solid #9c27b0;
        }
        
        .consent-info {
            background: #fff8e1;
            border: 2px solid #ff9800;
        }
        
        .section h3 {
            color: #288733;
            margin-bottom: 15px;
            font-size: 18px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px;
        }
        
        .info-item {
            background: white;
            padding: 15px;
            border-radius: 6px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            margin: 10px 0;
        }
        
        .info-item strong {
            color: #288733;
            display: block;
            margin-bottom: 5px;
            font-size: 14px;
        }
        
        .info-item span {
            color: #5d4037;
            font-size: 15px;
        }
        
        .actions {
            text-align: center;
            margin: 30px 0;
            padding: 25px;
            background: #288733;
            border-radius: 8px;
        }

        .actions a {
        color: white;
        font-weight: 600;
        }
        
        .dashboard-btn {
            display: inline-block;
            background: #4f3320;
            color: #288733;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 0 10px;
            transition: all 0.3s ease;
        }
        
        .dashboard-btn:hover {
            background: #ffd700;
            transform: translateY(-2px);
        }
        
        .footer {
            text-align: center;
            padding: 25px;
            background: #f5f5f5;
            border-top: 1px solid #ddd;
            color: #666;
            font-size: 14px;
        }
        
        @media (max-width: 600px) {
            .container {
                margin: 10px;
            }
            
            .header, .content {
                padding: 20px;
            }
            
            .summary-item {
                flex-direction: column;
                gap: 5px;
            }
            
            .summary-label, .summary-value {
                text-align: left;
            }
            
            .info-grid {
                grid-template-columns: 1fr;
            }
            
            .actions {
                padding: 20px;
            }
            
            .dashboard-btn {
                display: block;
                margin: 10px 0;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📋 NEW APPLICATION SUBMITTED</h1>
            <p>Arobisca Training Center - Website Application</p>
        </div>
        
        <div class="content">
            <div class="alert-banner">
                ⚡ New student application requires your attention
            </div>
            
            <div class="application-summary">
                <div class="summary-item">
                    <span class="summary-label">Application Number:</span>
                    <span class="summary-value" style="font-weight: 700; color: #288733;">${application.applicationNumber}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Submitted On:</span>
                    <span class="summary-value">${formattedDate}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Student Name:</span>
                    <span class="summary-value">${application.firstName} ${application.lastName}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Marketing Consent:</span>
                    <span class="summary-value">${marketingConsentText}</span>
                </div>
            </div>
            
            <div class="section personal-info">
                <h3>👤 Personal Information</h3>
                <div class="info-grid">
                    <div class="info-item">
                        <strong>Full Name</strong>
                        <span>${application.firstName} ${application.lastName}</span>
                    </div>
                    <div class="info-item">
                        <strong>Date of Birth</strong>
                        <span>${new Date(application.dateOfBirth).toLocaleDateString('en-US')}</span>
                    </div>
                    <div class="info-item">
                        <strong>Gender</strong>
                        <span>${application.gender}</span>
                    </div>
                    <div class="info-item">
                        <strong>Nationality</strong>
                        <span>${application.nationality}</span>
                    </div>
                    <div class="info-item">
                        <strong>Religion</strong>
                        <span>${application.religion || 'Not specified'}</span>
                    </div>
                    <div class="info-item">
                        <strong>ID/Passport</strong>
                        <span>${application.idPassport}</span>
                    </div>
                </div>
            </div>
            
            <div class="section course-info">
                <h3>📚 Course Information</h3>
                <div class="info-grid">
                    <div class="info-item">
                        <strong>Course Applied</strong>
                        <span>${application.course}</span>
                    </div>
                    <div class="info-item">
                        <strong>Preferred Start Date</strong>
                        <span>${new Date(application.preferredStartDate).toLocaleDateString('en-US')}</span>
                    </div>
                    <div class="info-item">
                        <strong>Preferred Class Time</strong>
                        <span>${application.preferredClassTime}</span>
                    </div>
                    <div class="info-item">
                        <strong>Application Status</strong>
                        <span style="color: #2196f3; font-weight: 600;">${application.status}</span>
                    </div>
                </div>
            </div>
            
            <div class="section contact-info">
                <h3>📞 Contact Information</h3>
                <div class="info-grid">
                    <div class="info-item">
                        <strong>Email Address</strong>
                        <span>${application.email}</span>
                    </div>
                    <div class="info-item">
                        <strong>Phone Number</strong>
                        <span>${application.phone}</span>
                    </div>
                </div>
                
                <h3 style="margin-top: 20px;">🚨 Emergency Contact</h3>
                <div class="info-grid">
                    <div class="info-item">
                        <strong>Name</strong>
                        <span>${application.emergencyContact.firstName} ${application.emergencyContact.lastName}</span>
                    </div>
                    <div class="info-item">
                        <strong>Relationship</strong>
                        <span>${application.emergencyContact.relation}</span>
                    </div>
                    <div class="info-item">
                        <strong>Phone</strong>
                        <span>${application.emergencyContact.phone}</span>
                    </div>
                </div>
            </div>
            
            <div class="section consent-info">
                <h3>✅ Marketing Consent Status</h3>
                <div class="info-item" style="text-align: center; font-size: 18px; padding: 20px;">
                    Marketing Consent for Photos/Videos: ${marketingConsentText}
                </div>
<div class="info-item" style="margin-top: 15px;">
  <strong>Consent Marked On:</strong>
  <span>${new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
        }</span>
</div>
            </div>
            
            ${application.additionalInfo ? `
            <div class="section" style="background: #ffebee; border: 2px solid #f44336;">
                <h3>📝 Additional Information</h3>
                <div class="info-item" style="background: white; margin-top: 15px;">
                    <p style="color: #5d4037; line-height: 1.6;">${application.additionalInfo}</p>
                </div>
            </div>
            ` : ''}
            
            <div class="actions">
                <a href="${process.env.ADMIN_DASHBOARD_URL}/applications" class="dashboard-btn">
                    📊 View in Dashboard
                </a>
                <a href="${process.env.ADMIN_DASHBOARD_URL}/applications" class="dashboard-btn">
                    📋 All Applications
                </a>
            </div>
            
            <p style="text-align: center; color: #666; margin-top: 20px; font-size: 14px;">
                This application was submitted via the website contact form. Please review and process accordingly.
            </p>
        </div>
        
        <div class="footer">
            <p>Arobisca Training Center - Admissions System</p>
            <p>Auto-generated notification | ${new Date().toLocaleString('en-US')}</p>
        </div>
    </div>
</body>
</html>`;
};

// Send application confirmation to applicant
const sendApplicationConfirmationEmail = async (application) => {
    try {
        const html = generateApplicationConfirmationTemplate(
            `${application.firstName} ${application.lastName}`,
            application.applicationNumber,
            application.course,
            application.preferredClassTime,
            application.preferredStartDate
        );

        await transporter.sendMail({
            from: arobiscaEmailUser,
            to: application.email,
            subject: `Application Received - ${application.applicationNumber} - Arobisca Training Center`,
            html,
            replyTo: 'info@arobiscatrainingcenter.co.ke'
        });

        console.log(`✅ Confirmation email sent to: ${application.email}`);
        return true;
    } catch (error) {
        console.error('❌ Failed to send confirmation email:', error);
        return false;
    }
};

// Send admin notification email
const sendAdminNotificationEmail = async (application) => {
    try {
        const adminEmail = process.env.AROBISCA_SMS_ADMIN_EMAIL || 'admin@arobiscatrainingcenter.co.ke';
        const html = generateAdminNotificationTemplate(application);

        await transporter.sendMail({
            from: arobiscaEmailUser,
            to: adminEmail,
            cc: process.env.AROBISCA_SMS_ADMIN_CC_EMAIL ? process.env.AROBISCA_SMS_ADMIN_CC_EMAIL.split(',') : [],
            subject: `📋 New Application: ${application.firstName} ${application.lastName} - ${application.applicationNumber}`,
            html,
            replyTo: application.email
        });

        console.log(`✅ Admin notification sent for application: ${application.applicationNumber}`);
        return true;
    } catch (error) {
        console.error('❌ Failed to send admin notification:', error);
        return false;
    }
};

// Send both emails (non-blocking)
const sendApplicationEmails = async (application) => {
    try {
        // Send confirmation to applicant
        sendApplicationConfirmationEmail(application).then(success => {
            if (success) {
                console.log(`✅ Applicant email sent for ${application.applicationNumber}`);
            }
        }).catch(err => {
            console.error(`❌ Error sending applicant email:`, err);
        });

        // Send notification to admin
        sendAdminNotificationEmail(application).then(success => {
            if (success) {
                console.log(`✅ Admin email sent for ${application.applicationNumber}`);
            }
        }).catch(err => {
            console.error(`❌ Error sending admin email:`, err);
        });

        return true;
    } catch (error) {
        console.error('❌ Error in email sending process:', error);
        return false;
    }
};


// Send rejection email
const sendRejectionEmail = async (application) => {
    try {
        const formattedDate = new Date(application.applicationDate).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Application Update - Arobisca Training Center</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', sans-serif;
            background-color: #f9f5f0;
            line-height: 1.6;
            color: #288733;
        }

        a {
            color: #4f3320;
            text-decoration: none;
            font-weight: 600;
        }
        
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(44, 24, 16, 0.1);
        }
        
        .header {
            background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);
            padding: 40px 30px;
            text-align: center;
            border-bottom: 4px solid #b91c1c;
        }
        
        .logo-container {
            margin-bottom: 20px;
        }
        
        .logo-text {
            color: white;
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 10px;
            letter-spacing: 1px;
            text-transform: uppercase;
        }
        
        .subtitle {
            color: rgba(255, 255, 255, 0.9);
            font-size: 16px;
            font-weight: 400;
            letter-spacing: 0.5px;
        }
        
        .content {
            padding: 40px 30px;
        }
        
        .greeting {
            color: #dc2626;
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 20px;
            border-bottom: 2px solid #f2e6d9;
            padding-bottom: 15px;
        }
        
        .message {
            color: #5d4037;
            font-size: 16px;
            margin-bottom: 25px;
            line-height: 1.8;
        }

        .message span {
            font-weight: 600;
        }
        
        .application-number {
            background: #fff;
            color: #dc2626;
            font-size: 18px;
            font-weight: 700;
            text-align: center;
            padding: 20px;
            border-radius: 8px;
            margin: 30px 0;
            box-shadow: 0 4px 12px rgba(220, 38, 38, 0.15);
            letter-spacing: 2px;
            border: 2px solid #dc2626;
        }
        
        .rejection-reason {
            background: #fef2f2;
            padding: 25px;
            border-radius: 8px;
            border-left: 4px solid #dc2626;
            margin: 30px 0;
        }
        
        .rejection-reason h3 {
            color: #dc2626;
            margin-bottom: 15px;
            font-size: 18px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .rejection-details {
            background: #f9f5f0;
            padding: 25px;
            border-radius: 8px;
            border: 2px solid #e0d4c4;
            margin: 30px 0;
        }
        
        .rejection-details h3 {
            color: #288733;
            margin-bottom: 20px;
            font-size: 18px;
        }
        
        .info-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 12px;
            padding-bottom: 12px;
            border-bottom: 1px solid #e0d4c4;
        }
        
        .info-item:last-child {
            border-bottom: none;
            margin-bottom: 0;
            padding-bottom: 0;
        }
        
        .info-label {
            color: #288733;
            font-weight: 600;
            min-width: 200px;
        }
        
        .info-value {
            color: #5d4037;
            text-align: right;
            flex: 1;
        }
        
        .encouragement {
            background: #e8f5e9;
            border: 2px solid #4caf50;
            border-radius: 8px;
            padding: 25px;
            margin: 30px 0;
        }
        
        .encouragement h3 {
            color: #288733;
            margin-bottom: 15px;
            font-size: 18px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .contact-section {
            background: #e3f2fd;
            border: 2px solid #2196f3;
            border-radius: 8px;
            padding: 25px;
            margin: 30px 0;
            text-align: center;
        }
        
        .contact-section h3 {
            color: #288733;
            margin-bottom: 15px;
            font-size: 18px;
        }
        
        .contact-info {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-top: 20px;
        }
        
        .contact-item {
            text-align: center;
            padding: 15px;
            background: white;
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .contact-item strong {
            display: block;
            color: #288733;
            margin-bottom: 5px;
        }
        
        .footer {
            text-align: center;
            padding: 30px;
            background: #dc2626;
            color: #ffffff;
            border-top: 4px solid #b91c1c;
        }
        
        .footer-text {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.8);
            margin-bottom: 10px;
        }
        
        .contact {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.8);
        }
        
        .contact a {
            color: #ffd700;
            text-decoration: none;
        }
        
        .contact a:hover {
            text-decoration: underline;
        }
        
        @media (max-width: 600px) {
            .container {
                margin: 10px;
            }
            
            .header, .content {
                padding: 30px 20px;
            }
            
            .application-number {
                font-size: 16px;
                padding: 15px;
                letter-spacing: 1px;
            }
            
            .info-item {
                flex-direction: column;
                gap: 5px;
            }
            
            .info-label, .info-value {
                text-align: left;
            }
            
            .contact-info {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo-container">
                <div class="logo-text">AROBISCA TRAINING CENTER</div>
                <div class="subtitle">Professional Coffee Training & Certification</div>
            </div>
        </div>
        
        <div class="content">
            <h1 class="greeting">Application Status Update</h1>
            
            <p class="message">
                Dear <span>${application.firstName} ${application.lastName}</span>,
            </p>
            
            <p class="message">
                Thank you for your application to Arobisca Training Center. We appreciate your interest in our 
                <strong>${application.course}</strong> program.
            </p>
            
            <div class="application-number">
                Application Reference: ${application.applicationNumber}
            </div>
            
            <div class="rejection-reason">
                <h3>❌ &nbsp; Application Decision</h3>
                <p class="message">
                    After careful review of your application, we regret to inform you that we are unable to 
                    offer you admission to the program at this time.
                </p>
                
                <div style="margin-top: 20px; padding: 15px; background: white; border-radius: 6px;">
                    <strong style="color: #dc2626; display: block; margin-bottom: 10px;">Reason for Decision:</strong>
                    <p style="color: #5d4037; line-height: 1.6;">${application.rejectionReason}</p>
                </div>
            </div>
            
            <div class="rejection-details">
                <h3>📋 &nbsp; Application Details</h3>
                <div class="info-item">
                    <span class="info-label">Application Number:</span>
                    <span class="info-value">${application.applicationNumber}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Course Applied:</span>
                    <span class="info-value">${application.course}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Application Date:</span>
                    <span class="info-value">${formattedDate}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Review Date:</span>
                    <span class="info-value">${new Date(application.reviewDate).toLocaleDateString('en-US')}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Final Status:</span>
                    <span class="info-value" style="color: #dc2626; font-weight: 600;">Rejected</span>
                </div>
            </div>
            
            <div class="encouragement">
                <h3>🌟 &nbsp; Future Opportunities</h3>
                <p class="message">
                    We encourage you to:
                </p>
                <ul style="color: #5d4037; padding-left: 20px; margin: 15px 0;">
                    <li>Consider applying for other programs that might better match your qualifications</li>
                    <li>Reapply in the future after gaining additional experience or qualifications</li>
                    <li>Explore our short courses and workshops that may be of interest</li>
                    <li>Follow our social media for updates on new programs and opportunities</li>
                </ul>
            </div>
            
            <div class="contact-section">
                <h3>📞 &nbsp; Questions or Concerns?</h3>
                <p class="message">
                    If you have any questions about this decision or would like feedback on your application, 
                    please don't hesitate to contact our admissions team:
                </p>
                <div class="contact-info">
                    <div class="contact-item">
                        <strong>Admissions Office</strong>
                        <div>+254 781 726 674</div>
                        <div>+254 724 637 787</div>
                    </div>
                    <div class="contact-item">
                        <strong>Email</strong>
                        <div>admissions@arobiscatrainingcenter.co.ke</div>
                    </div>
                </div>
            </div>
            
            <p class="message" style="text-align: center; margin-top: 40px;">
                We wish you the best in your future endeavors.<br>
                <strong>Arobisca Training Center Admissions Team</strong>
            </p>
        </div>
        
        <div class="footer">
            <p class="footer-text">AROBISCA TRAINING CENTER</p>
            <p class="footer-text">Muindi Mbingu Street, Eco Bank Towers, 5th floor, Nairobi, Kenya</p>
            <p class="contact">
                Email: <a href="mailto:info@arobiscatrainingcenter.co.ke">info@arobiscatrainingcenter.co.ke</a> | 
                Phone: <a href="tel:+254781726674">+254 781 726 674</a>
            </p>
            <p class="footer-text" style="margin-top: 15px;">
                &copy; ${new Date().getFullYear()} Arobisca Training Center. All rights reserved.
            </p>
        </div>
    </div>
</body>
</html>`;

        const mailOptions = {
            from: arobiscaEmailUser,
            to: application.email,
            subject: `Application Decision - ${application.applicationNumber} - Arobisca Training Center`,
            html,
            replyTo: 'admissions@arobiscatrainingcenter.co.ke'
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Rejection email sent to ${application.email}:`, info.messageId);
        return true;
        
    } catch (error) {
        console.error('❌ Error sending rejection email:', error);
        throw error;
    }
};

// Send admission confirmation email
const sendAdmissionConfirmationEmail = async (student, application) => {
    try {
        const formattedAdmissionDate = new Date(student.admissionDate).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const formattedStartDate = new Date(student.startDate).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admission Confirmation - Arobisca Training Center</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', sans-serif;
            background-color: #f9f5f0;
            line-height: 1.6;
            color: #288733;
        }

        a {
            color: #4f3320;
            text-decoration: none;
            font-weight: 600;
        }
        
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(44, 24, 16, 0.1);
        }
        
        .header {
            background: linear-gradient(135deg, #288733 0%, #6cb26f 100%);
            padding: 40px 30px;
            text-align: center;
            border-bottom: 4px solid #4f3320;
        }
        
        .logo-container {
            margin-bottom: 20px;
        }
        
        .logo-text {
            color: white;
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 10px;
            letter-spacing: 1px;
            text-transform: uppercase;
        }
        
        .subtitle {
            color: rgba(255, 255, 255, 0.9);
            font-size: 16px;
            font-weight: 400;
            letter-spacing: 0.5px;
        }
        
        .content {
            padding: 40px 30px;
        }
        
        .greeting {
            color: #288733;
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 20px;
            border-bottom: 2px solid #f2e6d9;
            padding-bottom: 15px;
        }
        
        .message {
            color: #5d4037;
            font-size: 16px;
            margin-bottom: 25px;
            line-height: 1.8;
        }

        .message span {
            font-weight: 600;
        }
        
        .admission-number {
            background: linear-gradient(135deg, #4f3320 0%, #8b5a2b 100%);
            color: white;
            font-size: 22px;
            font-weight: 700;
            text-align: center;
            padding: 25px;
            border-radius: 8px;
            margin: 30px 0;
            box-shadow: 0 4px 20px rgba(79, 51, 32, 0.3);
            letter-spacing: 2px;
            border: 3px solid #288733;
        }
        
        .congratulations {
            background: #e8f5e9;
            padding: 30px;
            border-radius: 8px;
            border: 3px solid #4caf50;
            margin: 30px 0;
            text-align: center;
        }
        
        .congratulations h3 {
            color: #288733;
            font-size: 24px;
            margin-bottom: 15px;
        }
        
        .admission-details {
            background: #f9f5f0;
            padding: 30px;
            border-radius: 8px;
            border: 2px solid #e0d4c4;
            margin: 30px 0;
        }
        
        .admission-details h3 {
            color: #288733;
            margin-bottom: 25px;
            font-size: 20px;
            text-align: center;
        }
        
        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }
        
        .info-item {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .info-item strong {
            color: #288733;
            display: block;
            margin-bottom: 8px;
            font-size: 14px;
        }
        
        .info-item span {
            color: #5d4037;
            font-size: 16px;
            font-weight: 500;
        }
        
        .next-steps {
            background: #fff8e1;
            padding: 30px;
            border-radius: 8px;
            border: 3px solid #ffc107;
            margin: 30px 0;
        }
        
        .next-steps h3 {
            color: #288733;
            margin-bottom: 20px;
            font-size: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .next-steps ol {
            padding-left: 20px;
            color: #5d4037;
        }
        
        .next-steps li {
            margin-bottom: 15px;
            line-height: 1.6;
        }
        
        .payment-info {
            background: #e3f2fd;
            padding: 30px;
            border-radius: 8px;
            border: 3px solid #2196f3;
            margin: 30px 0;
        }
        
        .payment-info h3 {
            color: #288733;
            margin-bottom: 20px;
            font-size: 20px;
        }
        
        .payment-details {
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        
        .payment-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding-bottom: 10px;
            border-bottom: 1px solid #e0d4c4;
        }
        
        .payment-row:last-child {
            border-bottom: none;
            margin-bottom: 0;
            padding-bottom: 0;
        }
        
        .payment-label {
            color: #288733;
            font-weight: 600;
        }
        
        .payment-value {
            color: #5d4037;
            font-weight: 500;
        }
        
        .contact-section {
            background: #f3e5f6;
            padding: 30px;
            border-radius: 8px;
            border: 3px solid #9c27b0;
            margin: 30px 0;
            text-align: center;
        }
        
        .contact-section h3 {
            color: #288733;
            margin-bottom: 20px;
            font-size: 20px;
        }
        
        .contact-info {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-top: 20px;
        }
        
        .contact-item {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .contact-item strong {
            display: block;
            color: #288733;
            margin-bottom: 10px;
        }
        
        .footer {
            text-align: center;
            padding: 30px;
            background: #288733;
            color: #ffffff;
            border-top: 4px solid #4f3320;
        }
        
        .footer-text {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.8);
            margin-bottom: 10px;
        }
        
        .contact {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.8);
        }
        
        .contact a {
            color: #ffd700;
        }
        
        .contact a:hover {
            text-decoration: underline;
        }
        
        @media (max-width: 600px) {
            .container {
                margin: 10px;
            }
            
            .header, .content {
                padding: 30px 20px;
            }
            
            .admission-number {
                font-size: 18px;
                padding: 20px;
            }
            
            .info-grid {
                grid-template-columns: 1fr;
            }
            
            .contact-info {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo-container">
                <div class="logo-text">AROBISCA TRAINING CENTER</div>
                <div class="subtitle">Professional Coffee Training & Certification</div>
            </div>
        </div>
        
        <div class="content">
            <div class="congratulations">
                <h3>🎉 CONGRATULATIONS! 🎉</h3>
                <p class="message" style="font-size: 18px;">
                    You have been <strong>ADMITTED</strong> to Arobisca Training Center!
                </p>
            </div>
            
            <h1 class="greeting">Welcome to Arobisca Training Center!</h1>
            
            <p class="message">
                Dear <span>${student.firstName} ${student.lastName}</span>,
            </p>
            
            <p class="message">
                We are thrilled to inform you that your application has been reviewed and you have been 
                <strong>admitted</strong> to our <strong>${student.courseName}</strong> program. 
                Welcome to the Arobisca family!
            </p>
            
            <div class="admission-number">
                Your Admission Number: ${student.admissionNumber}
            </div>
            
            <div class="admission-details">
                <h3>📋 Admission Details</h3>
                <div class="info-grid">
                    <div class="info-item">
                        <strong>Admission Number</strong>
                        <span>${student.admissionNumber}</span>
                    </div>
                    <div class="info-item">
                        <strong>Course</strong>
                        <span>${student.courseName}</span>
                    </div>
                    <div class="info-item">
                        <strong>Duration</strong>
                        <span>${student.courseDuration}</span>
                    </div>
                    <div class="info-item">
                        <strong>Course Fee</strong>
                        <span>KES ${student.courseFee?.toLocaleString() || 'To be advised'}</span>
                    </div>
                    <div class="info-item">
                        <strong>Admission Date</strong>
                        <span>${formattedAdmissionDate}</span>
                    </div>
                    <div class="info-item">
                        <strong>Start Date</strong>
                        <span>${formattedStartDate}</span>
                    </div>
                    <div class="info-item">
                        <strong>Academic Year</strong>
                        <span>${student.academicYear}</span>
                    </div>
                    <div class="info-item">
                        <strong>Upfront Fee Paid</strong>
                        <span>KES ${student.upfrontFee?.toLocaleString() || '0'}</span>
                    </div>
                </div>
            </div>
            
            <div class="next-steps">
                <h3>📝 &nbsp; Next Steps</h3>
                <ol>
                    <li><strong>Complete Payment</strong> - Pay the course fees according to the payment plan</li>
                    <li><strong>Orientation</strong> - Attend the mandatory orientation session on your start date</li>
                    <li><strong>Submit Documents</strong> - Bring original documents for verification</li>
                    <li><strong>Course Materials</strong> - Collect your course materials and schedule</li>
                    <li><strong>Student Portal</strong> - You will receive login details for the student portal</li>
                </ol>
            </div>
            
            <div class="payment-info">
                <h3>💳 Payment Information</h3>
                <div class="payment-details">
                    <div class="payment-row">
                        <span class="payment-label">Bank:</span>
                        <span class="payment-value">KCB BANK KENYA</span>
                    </div>
                    <div class="payment-row">
                        <span class="payment-label">Account Number:</span>
                        <span class="payment-value">1287498361</span>
                    </div>
                    <div class="payment-row">
                        <span class="payment-label">Account Name:</span>
                        <span class="payment-value">AROBISCA GROUP LTD</span>
                    </div>
                    <div class="payment-row">
                        <span class="payment-label">Payment Reference:</span>
                        <span class="payment-value" style="color: #dc2626; font-weight: 700;">${student.admissionNumber}</span>
                    </div>
                </div>
                <p class="message">
                    <strong>Important:</strong> Always include your admission number as the payment reference.
                </p>
            </div>
            
            <div class="contact-section">
                <h3>📞 Need Assistance?</h3>
                <p class="message">
                    Our admissions team is here to help you with any questions:
                </p>
                <div class="contact-info">
                    <div class="contact-item">
                        <strong>Admissions Office</strong>
                        <div>+254 781 726 674</div>
                        <div>+254 724 637 787</div>
                    </div>
                    <div class="contact-item">
                        <strong>Email</strong>
                        <div>admissions@arobiscatrainingcenter.co.ke</div>
                        <div>info@arobiscatrainingcenter.co.ke</div>
                    </div>
                </div>
            </div>
            
            <p class="message" style="text-align: center; margin-top: 40px; font-size: 18px;">
                We look forward to welcoming you to our campus!<br>
                <strong>The Arobisca Training Center Team</strong>
            </p>
        </div>
        
        <div class="footer">
            <p class="footer-text">AROBISCA TRAINING CENTER</p>
            <p class="footer-text">Muindi Mbingu Street, Eco Bank Towers, 5th floor, Nairobi, Kenya</p>
            <p class="contact">
                Email: <a href="mailto:info@arobiscatrainingcenter.co.ke">info@arobiscatrainingcenter.co.ke</a> | 
                Phone: <a href="tel:+254781726674">+254 781 726 674</a>
            </p>
            <p class="footer-text" style="margin-top: 15px;">
                &copy; ${new Date().getFullYear()} Arobisca Training Center. All rights reserved.
            </p>
        </div>
    </div>
</body>
</html>`;

        const mailOptions = {
            from: arobiscaEmailUser,
            to: student.email,
            subject: `🎉 Admission Confirmation - ${student.admissionNumber} - Arobisca Training Center`,
            html,
            replyTo: 'admissions@arobiscatrainingcenter.co.ke'
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Admission confirmation email sent to ${student.email}:`, info.messageId);
        return true;
        
    } catch (error) {
        console.error('❌ Error sending admission confirmation email:', error);
        throw error;
    }
};

// Helper function to calculate end date
const calculateEndDate = (startDate, courseDuration) => {
    if (!startDate || !courseDuration) return null;
    
    const date = new Date(startDate);
    const durationStr = courseDuration.toLowerCase().trim();
    
    // Parse duration string (e.g., "6 months", "1 year", "12 weeks")
    const monthMatch = durationStr.match(/(\d+)\s*months?/);
    const yearMatch = durationStr.match(/(\d+)\s*years?/);
    const weekMatch = durationStr.match(/(\d+)\s*weeks?/);
    
    if (monthMatch) {
        date.setMonth(date.getMonth() + parseInt(monthMatch[1]));
    } else if (yearMatch) {
        date.setFullYear(date.getFullYear() + parseInt(yearMatch[1]));
    } else if (weekMatch) {
        date.setDate(date.getDate() + (parseInt(weekMatch[1]) * 7));
    }
    
    return date;
};

// Generate newsletter student letter template
const generateStudentLetterTemplate = (templateData) => {
    const {
        studentName,
        admissionNumber,
        courseName,
        startDate,
        endDate,
        courseDuration,
        signedBy,
        refNumber
    } = templateData;

    const formattedStartDate = startDate ? new Date(startDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }) : '_______________';

    const formattedEndDate = endDate ? new Date(endDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }) : courseDuration ? `[Calculated from ${courseDuration}]` : '_______________';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; margin: 20px; }
        .container { max-width: 600px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 30px; }
        .content { text-align: justify; }
        .signature { margin-top: 40px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h3>AROBISCA TRAINING INSTITUTE</h3>
            <p><strong>Official Student Confirmation Letter</strong></p>
        </div>

        <div class="content">
            <p><strong>REF:</strong> ${refNumber || 'ATC/STU/_________'}</p>
            <p><strong>RE:</strong> OFFICIAL STUDENT LETTER</p>

            <p>This letter is to formally confirm that <strong>${studentName || '_________________________________'}</strong>, 
            ID/Admission No. <strong>${admissionNumber || '________'}</strong>, is a registered student at Arobisca Training Institute.</p>

            <p>The student is currently enrolled in the <strong>${courseName || '_________________________________'}</strong> program, 
            which commenced on <strong>${formattedStartDate}</strong> and is scheduled to end on <strong>${formattedEndDate}</strong>.</p>

            <p>Arobisca Training Institute is a professional skills development institution specializing in coffee, beverage, and hospitality training, 
            equipping learners with practical, industry-relevant competencies.</p>

            <p>This letter is issued upon the student's request for official purposes, including but not limited to attachment, internship, 
            identification, sponsorship, or institutional reference.</p>

            <p>Should you require any further information or verification, please do not hesitate to contact our office.</p>

            <p>Yours faithfully,</p>

            <div class="signature">
                <p>______________________________</p>
                <p><strong>Name:</strong> ${signedBy || '________________________'}</p>
                <p><strong>Title:</strong> ________________________</p>
                <p><strong>For:</strong> Arobisca Training Institute</p>
            </div>
        </div>
    </div>
</body>
</html>
    `;
};

// Send newsletter email (template or custom)
const sendNewsletterEmail = async (recipientEmail, subject, body, templateData = null) => {
    try {
        const mailOptions = {
            from: arobiscaEmailUser,
            to: recipientEmail,
            subject: subject,
            html: body, // body is already HTML
        };

        const info = await transporter.sendMail(mailOptions);
        
        return {
            success: true,
            messageId: info.messageId
        };
    } catch (error) {
        console.error('Error sending newsletter email:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

module.exports = {
    transporter,
    generateApplicationConfirmationTemplate,
    generateAdminNotificationTemplate,
    sendApplicationConfirmationEmail,
    sendAdminNotificationEmail,
    sendApplicationEmails,
    sendRejectionEmail,
    sendAdmissionConfirmationEmail,
    sendNewsletterEmail,
    generateStudentLetterTemplate,
    calculateEndDate
};