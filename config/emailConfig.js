const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    port: 465,
    secure: true,
    logger: true,
    debug: false,
    secureConnection: false,
    auth: {
        user: process.env.ZOEZI_EMAIL,
        pass: process.env.ZOEZI_EMAIL_PASSWORD,
    },
    tls: {
        rejectUnauthorized: true
    }
});

// Application confirmation email template
const generateApplicationConfirmationTemplate = (applicantName, applicationNumber) => {
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Application Confirmation - Nairobi Zoezi School</title>
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
            max-width: 600px;
            margin: 0 auto;
            background: #ffffff;
        }
        
        .header {
            background: linear-gradient(135deg, #3d3531 0%, #2b2520 100%);
            padding: 40px 30px;
            text-align: center;
            border-radius: 0 0 20px 20px;
        }
        
        .logo {
            color: #ffffff;
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 10px;
            letter-spacing: 1px;
        }
        
        .tagline {
            color: rgba(255, 255, 255, 0.9);
            font-size: 16px;
            font-weight: 400;
        }
        
        .content {
            padding: 40px 30px;
        }
        
        .greeting {
            color: #2c3e50;
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 20px;
        }
        
        .message {
            color: #666;
            font-size: 16px;
            margin-bottom: 30px;
            line-height: 1.8;
        }
        
        .application-number {
            background: linear-gradient(135deg, #3d3531 0%, #2b2520 100%);
            color: #ffffff;
            font-size: 18px;
            font-weight: 700;
            text-align: center;
            padding: 20px;
            border-radius: 10px;
            margin: 30px 0;
            box-shadow: 0 5px 15px rgba(44, 62, 80, 0.2);
            letter-spacing: 2px;
        }
        
        .info-box {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 10px;
            border-left: 4px solid #3d3531;
            margin: 30px 0;
        }
        
        .info-box h3 {
            color: #2c3e50;
            margin-bottom: 15px;
            font-size: 18px;
        }
        
        .info-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding-bottom: 10px;
            border-bottom: 1px solid #e0e0e0;
        }
        
        .info-item:last-child {
            border-bottom: none;
            margin-bottom: 0;
            padding-bottom: 0;
        }
        
        .info-label {
            color: #2c3e50;
            font-weight: 600;
        }
        
        .info-value {
            color: #666;
        }
        
        .next-steps {
            background: #ecf0f1;
            padding: 20px;
            border-radius: 10px;
            margin: 30px 0;
        }
        
        .next-steps h3 {
            color: #2c3e50;
            margin-bottom: 15px;
            font-size: 18px;
        }
        
        .next-steps ul {
            padding-left: 20px;
        }
        
        .next-steps li {
            margin-bottom: 10px;
            color: #666;
        }
        
        .security-note {
            background: #e8f4f8;
            border: 1px solid #b3d9e8;
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
        }
        
        .security-note p {
            color: #2c3e50;
            font-size: 14px;
            line-height: 1.6;
        }
        
        .footer {
            text-align: center;
            padding: 30px;
            background: #1a1a1a;
            color: #ffffff;
            border-radius: 20px 20px 0 0;
        }
        
        .footer-text {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.7);
            margin-bottom: 10px;
        }
        
        .contact {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.7);
        }
        
        .divider {
            height: 2px;
            background: linear-gradient(90deg, transparent, #2c3e50, transparent);
            margin: 30px 0;
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
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">NAIROBI ZOEZI SCHOOL</div>
            <div class="tagline">Excellence in Sports & Fitness Education</div>
        </div>
        
        <div class="content">
            <h1 class="greeting">Application Received! ✅</h1>
            
            <p class="message">
                Dear <strong>${applicantName}</strong>,
            </p>
            
            <p class="message">
                Thank you for applying to Nairobi Zoezi School! We are excited about your interest in our programs.
                We have successfully received your application and our admissions team is reviewing it.
            </p>
            
            <div class="application-number">
                Application #: ${applicationNumber}
            </div>
            
            <div class="info-box">
                <h3>📋 Application Status</h3>
                <div class="info-item">
                    <span class="info-label">Status:</span>
                    <span class="info-value">Under Review</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Reference Number:</span>
                    <span class="info-value">${applicationNumber}</span>
                </div>
            </div>
            
            <div class="next-steps">
                <h3>📌 What Happens Next?</h3>
                <ul>
                    <li>Our admissions team will review your application thoroughly</li>
                    <li>You will receive email updates on your application status</li>
                    <li>If shortlisted, we will contact you for an interview</li>
                    <li>Expected response time: 5-7 business days</li>
                    <li>Keep an eye on your email inbox for important updates</li>
                </ul>
            </div>
            
            <div class="security-note">
                <p>
                    <strong>⚠️ Please keep your Application Reference Number safe.</strong><br>
                    Use it for all future communications regarding your application.
                </p>
            </div>
            
            <p class="message">
                If you have any questions or need to update your application, please don't hesitate to reach out to our admissions team.
            </p>
            
            <div style="text-align: center; margin-top: 30px;">
                <p class="message" style="margin-bottom: 10px;">
                    Best Regards,<br>
                    <strong>Nairobi Zoezi School Admissions Team</strong>
                </p>
            </div>
        </div>
        
        <div class="footer">
            <p class="footer-text">NAIROBI ZOEZI SCHOOL</p>
            <p class="footer-text">Excellence in Sports & Fitness Education</p>
            <p class="contact">Contact us: admissions@nairobi-zoezi.com | +254 746 139 413</p>
            <p class="footer-text" style="margin-top: 15px;">
                &copy; 2024 Nairobi Zoezi School. All rights reserved.
            </p>
        </div>
    </div>
</body>
</html>
  `;
};

// Status change template (rejection/acceptance/other)
const generateStatusChangeTemplate = (applicantName, applicationNumber, newStatus, adminNote) => {
    return `
<div style="font-family: Inter, sans-serif; color: #333;">
    <h2>Application Update - ${applicationNumber}</h2>
    <p>Dear <strong>${applicantName}</strong>,</p>
    <p>Your application reference <strong>${applicationNumber}</strong> has been updated to: <strong>${newStatus.toUpperCase()}</strong>.</p>
    ${adminNote ? `<p><strong>Note from Admissions:</strong> ${adminNote}</p>` : ""}
    <p>If you have any questions, reply to this email or contact our admissions team.</p>
    <p>Best Regards,<br/>Nairobi Zoezi School Admissions Team</p>
</div>
    `;
};

// Student welcome template (sent on acceptance/registration)
const generateStudentWelcomeTemplate = (studentName, admissionNumber, startDate, course, courseFee, upfrontFee) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const courseFeeNum = parseFloat(courseFee) || 0;
    const upfrontFeeNum = parseFloat(upfrontFee) || 0;
    const balance = courseFeeNum - upfrontFeeNum;
    
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admission Confirmed - Nairobi Zoezi School</title>
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
            max-width: 600px;
            margin: 0 auto;
            background: #ffffff;
        }
        
        .header {
            background: linear-gradient(135deg, #27ae60 0%, #229954 100%);
            padding: 40px 30px;
            text-align: center;
            border-radius: 0 0 20px 20px;
        }
        
        .logo {
            color: #ffffff;
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 10px;
            letter-spacing: 1px;
        }
        
        .tagline {
            color: rgba(255, 255, 255, 0.9);
            font-size: 16px;
            font-weight: 400;
        }
        
        .content {
            padding: 40px 30px;
        }
        
        .greeting {
            color: #27ae60;
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 20px;
        }
        
        .message {
            color: #666;
            font-size: 16px;
            margin-bottom: 20px;
            line-height: 1.8;
        }
        
        .admission-number {
            background: linear-gradient(135deg, #27ae60 0%, #229954 100%);
            color: #ffffff;
            font-size: 20px;
            font-weight: 700;
            text-align: center;
            padding: 25px;
            border-radius: 10px;
            margin: 30px 0;
            box-shadow: 0 5px 15px rgba(39, 174, 96, 0.2);
            letter-spacing: 2px;
        }
        
        .info-box {
            background: #f0fdf4;
            padding: 25px;
            border-radius: 10px;
            border-left: 5px solid #27ae60;
            margin: 30px 0;
        }
        
        .info-box h3 {
            color: #27ae60;
            margin-bottom: 15px;
            font-size: 18px;
            font-weight: 600;
        }
        
        .info-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid #d1fae5;
        }
        
        .info-item:last-child {
            border-bottom: none;
            margin-bottom: 0;
            padding-bottom: 0;
        }
        
        .info-label {
            color: #27ae60;
            font-weight: 600;
        }
        
        .info-value {
            color: #333;
            font-weight: 500;
        }
        
        .payment-info {
            background: #fff3cd;
            border: 1px solid #ffc107;
            border-radius: 10px;
            padding: 20px;
            margin: 30px 0;
        }
        
        .payment-info h3 {
            color: #856404;
            margin-bottom: 15px;
            font-size: 18px;
            font-weight: 600;
        }
        
        .payment-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding-bottom: 8px;
            border-bottom: 1px solid #e2b980;
            color: #666;
        }
        
        .payment-item:last-child {
            border-bottom: none;
            margin-bottom: 0;
            padding-bottom: 0;
        }
        
        .payment-item strong {
            color: #333;
        }
        
        .balance-row {
            background: #f0f0f0;
            padding: 10px;
            border-radius: 5px;
            font-weight: 700;
            color: #856404;
        }
        
        .flexibility-box {
            background: #e7f3ff;
            border: 1px solid #b3d9ff;
            border-radius: 10px;
            padding: 20px;
            margin: 30px 0;
        }
        
        .flexibility-box h3 {
            color: #0056b3;
            margin-bottom: 15px;
            font-size: 16px;
            font-weight: 600;
        }
        
        .flexibility-box p {
            color: #004085;
            font-size: 14px;
            line-height: 1.6;
        }
        
        .login-box {
            background: #e8f5e9;
            border-left: 5px solid #27ae60;
            padding: 20px;
            border-radius: 10px;
            margin: 30px 0;
        }
        
        .login-box h3 {
            color: #27ae60;
            margin-bottom: 15px;
            font-size: 16px;
            font-weight: 600;
        }
        
        .login-box p {
            color: #2e7d32;
            margin-bottom: 10px;
        }
        
        .login-link {
            display: inline-block;
            background: #27ae60;
            color: #fff;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 5px;
            font-weight: 600;
            margin-top: 10px;
        }
        
        .footer {
            text-align: center;
            padding: 30px;
            background: #1a1a1a;
            color: #ffffff;
            border-radius: 20px 20px 0 0;
        }
        
        .footer-text {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.7);
            margin-bottom: 10px;
        }
        
        .contact {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.7);
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
            
            .info-item, .payment-item {
                flex-direction: column;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">NAIROBI ZOEZI SCHOOL</div>
            <div class="tagline">Excellence in Sports & Fitness Education</div>
        </div>
        
        <div class="content">
            <h1 class="greeting">🎉 Congratulations! Admission Confirmed</h1>
            
            <p class="message">
                Dear <strong>${studentName}</strong>,
            </p>
            
            <p class="message">
                We are delighted to inform you that your admission to Nairobi Zoezi School has been confirmed! 
                We look forward to welcoming you to our community.
            </p>
            
            <div class="admission-number">
                Admission #: ${admissionNumber}
            </div>
            
            <div class="info-box">
                <h3>📋 Admission Details</h3>
                <div class="info-item">
                    <span class="info-label">Admission Number:</span>
                    <span class="info-value">${admissionNumber}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Course:</span>
                    <span class="info-value">${course}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Start Date:</span>
                    <span class="info-value">${startDate || 'To be confirmed'}</span>
                </div>
            </div>
            
            <div class="payment-info">
                <h3>💰 Fee Breakdown</h3>
                <div class="payment-item">
                    <strong>Total Course Fee:</strong>
                    <span>KES ${courseFeeNum.toLocaleString()}</span>
                </div>
                <div class="payment-item">
                    <strong>Upfront Payment:</strong>
                    <span>KES ${upfrontFeeNum.toLocaleString()}</span>
                </div>
                <div class="payment-item balance-row">
                    Balance Due: KES ${balance.toLocaleString()}
                </div>
            </div>
            
            <div class="flexibility-box">
                <h3>💳 Payment Flexibility</h3>
                <p>We accept monthly installments to make the course affordable for all students. Contact our finance team for a customized payment plan that works for you.</p>
            </div>
            
            <div class="login-box">
                <h3>🔐 Access Your Student Portal</h3>
                <p>You can login to the student portal using your phone number as your initial password.</p>
                <p><strong>Note:</strong> Please change your password immediately after your first login for security purposes.</p>
                <a href="${frontendUrl}/login" class="login-link">Access Student Portal Here</a>
            </div>
            
            <p class="message">
                If you have any questions or need further assistance, please don't hesitate to reach out to our admissions team.
            </p>
            
            <div style="text-align: center; margin-top: 30px;">
                <p class="message" style="margin-bottom: 10px;">
                    Welcome to Nairobi Zoezi School!<br>
                    <strong>Nairobi Zoezi School Admissions Team</strong>
                </p>
            </div>
        </div>
        
        <div class="footer">
            <p class="footer-text">NAIROBI ZOEZI SCHOOL</p>
            <p class="footer-text">Excellence in Sports & Fitness Education</p>
            <p class="contact">Contact us: admissions@nairobi-zoezi.com | +254 746 139 413</p>
            <p class="footer-text" style="margin-top: 15px;">
                &copy; 2024 Nairobi Zoezi School. All rights reserved.
            </p>
        </div>
    </div>
</body>
</html>
    `;
};

// Password Reset Code Template
const generatePasswordResetTemplate = (firstName, resetCode) => {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset - Nairobi Zoezi</title>
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
            max-width: 600px;
            margin: 0 auto;
            background: #ffffff;
        }
        
        .header {
            background: linear-gradient(135deg, #2b2520 0%, #3d3531 100%);
            padding: 40px 30px;
            color: white;
            text-align: center;
        }
        
        .logo {
            font-size: 32px;
            font-weight: 700;
            margin: 0 0 10px 0;
            letter-spacing: 1px;
        }
        
        .tagline {
            font-size: 14px;
            color: #d4a644;
            opacity: 0.9;
            margin: 0;
        }
        
        .content {
            padding: 40px 30px;
        }
        
        .greeting {
            color: #2b2520;
            font-size: 24px;
            font-weight: 600;
            margin: 0 0 8px 0;
        }
        
        .description {
            color: #666;
            font-size: 16px;
            margin: 0 0 25px 0;
            line-height: 1.6;
        }
        
        .reset-code-box {
            background-color: #d4a644;
            padding: 15px 30px;
            border-radius: 8px;
            margin: 30px 0;
            text-align: center;
        }
        
        .reset-code-label {
            color: #2b2520;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
        }
        
        .reset-code {
            color: #2b2520;
            font-size: 36px;
            font-weight: 700;
            letter-spacing: 5px;
            margin: 0;
            font-family: 'Courier New', monospace;
        }
        
        .warning-box {
            background-color: #fff3cd;
            border: 1px solid #ffc107;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
        }
        
        .warning-title {
            color: #856404;
            font-weight: 600;
            font-size: 14px;
            margin: 0 0 8px 0;
        }
        
        .warning-text {
            color: #856404;
            font-size: 14px;
            margin: 0;
            line-height: 1.5;
        }
        
        .expiry-notice {
            background-color: #e8f4f8;
            border-left: 4px solid #0c5460;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
        }
        
        .expiry-text {
            color: #0c5460;
            font-size: 14px;
            margin: 0;
            line-height: 1.5;
        }
        
        .footer-note {
            color: #666;
            font-size: 14px;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
        }
        
        .footer {
            text-align: center;
            padding: 30px;
            background: #1a1a1a;
            color: #ffffff;
            border-radius: 20px 20px 0 0;
        }
        
        .footer-text {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.7);
            margin-bottom: 10px;
        }
        
        .contact {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.7);
        }
        
        @media (max-width: 600px) {
            .container {
                margin: 10px;
            }
            
            .header, .content {
                padding: 30px 20px;
            }
            
            .greeting {
                font-size: 20px;
            }
            
            .reset-code {
                font-size: 28px;
                letter-spacing: 3px;
            }
            
            .reset-code-box {
                padding: 12px 20px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">NAIROBI ZOEZI</div>
            <div class="tagline">Alumni & Professional Portal</div>
        </div>
        
        <div class="content">
            <h2 class="greeting">Password Reset Request</h2>
            
            <p class="description">
                Hi ${firstName},
            </p>
            
            <p class="description">
                You requested to reset your password. Use the 4-digit code below to verify your identity and proceed with resetting your password.
            </p>
            
            <div class="reset-code-box">
                <div class="reset-code-label">Your Reset Code</div>
                <p class="reset-code">${resetCode}</p>
            </div>
            
            <div class="warning-box">
                <p class="warning-title">⚠️ Security Notice</p>
                <p class="warning-text">
                    Do not share this code with anyone. Nairobi Zoezi staff will never ask for this code via email or phone.
                </p>
            </div>
            
            <div class="expiry-notice">
                <p class="expiry-text">
                    <strong>⏱️ This code will expire in 15 minutes.</strong> If you don't use it within this time, you'll need to request a new one.
                </p>
            </div>
            
            <p class="description">
                If you didn't request this password reset, please ignore this email. Your account security has not been compromised.
            </p>
            
            <p class="footer-note">
                If you have any questions or concerns, please contact our support team.
            </p>
        </div>
        
        <div class="footer">
            <p class="footer-text">NAIROBI ZOEZI</p>
            <p class="footer-text">Alumni & Professional Portal</p>
            <p class="contact">Contact us: support@nairobi-zoezi.com | +254 746 139 413</p>
            <p class="footer-text" style="margin-top: 15px;">
                &copy; 2025 Nairobi Zoezi Institute. All rights reserved.
            </p>
        </div>
    </div>
</body>
</html>
    `;
};

// Admin notification for new application
const generateAdminApplicationNotificationTemplate = (applicantName, applicationNumber, email, phone, course, applicationDate) => {
    const adminPanelUrl = process.env.ADMIN_PANEL_URL || 'https://zoezischool.com/admin';
    
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔔 New Application Submission - Nairobi Zoezi School</title>
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
            max-width: 600px;
            margin: 0 auto;
            background: #ffffff;
        }
        
        .header {
            background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
            padding: 40px 30px;
            text-align: center;
            border-radius: 0 0 20px 20px;
        }
        
        .logo {
            color: #ffffff;
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 10px;
            letter-spacing: 1px;
        }
        
        .tagline {
            color: rgba(255, 255, 255, 0.9);
            font-size: 16px;
            font-weight: 400;
        }
        
        .alert-badge {
            display: inline-block;
            background: #fff;
            color: #e74c3c;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: 700;
            font-size: 14px;
            margin-top: 10px;
        }
        
        .content {
            padding: 40px 30px;
        }
        
        .greeting {
            color: #e74c3c;
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 20px;
        }
        
        .message {
            color: #666;
            font-size: 16px;
            margin-bottom: 20px;
            line-height: 1.8;
        }
        
        .application-card {
            background: #f8f9fa;
            border: 2px solid #e74c3c;
            border-radius: 10px;
            padding: 25px;
            margin: 30px 0;
        }
        
        .application-card h3 {
            color: #e74c3c;
            margin-bottom: 20px;
            font-size: 18px;
            border-bottom: 2px solid #e74c3c;
            padding-bottom: 10px;
        }
        
        .info-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 12px;
            padding-bottom: 10px;
            border-bottom: 1px solid #e0e0e0;
        }
        
        .info-item:last-child {
            border-bottom: none;
            margin-bottom: 0;
            padding-bottom: 0;
        }
        
        .info-label {
            color: #2c3e50;
            font-weight: 600;
        }
        
        .info-value {
            color: #666;
        }
        
        .action-box {
            background: #fff3cd;
            border-left: 5px solid #ffc107;
            padding: 20px;
            border-radius: 10px;
            margin: 30px 0;
        }
        
        .action-box h3 {
            color: #856404;
            margin-bottom: 15px;
            font-size: 16px;
        }
        
        .action-button {
            display: inline-block;
            background: #e74c3c;
            color: #fff;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 5px;
            font-weight: 600;
            margin-top: 10px;
        }
        
        .footer {
            text-align: center;
            padding: 30px;
            background: #1a1a1a;
            color: #ffffff;
            border-radius: 20px 20px 0 0;
        }
        
        .footer-text {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.7);
            margin-bottom: 10px;
        }
        
        .contact {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.7);
        }
        
        @media (max-width: 600px) {
            .container {
                margin: 10px;
            }
            
            .header, .content {
                padding: 30px 20px;
            }
            
            .info-item {
                flex-direction: column;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">NAIROBI ZOEZI SCHOOL</div>
            <div class="tagline">Excellence in Sports & Fitness Education</div>
            <div class="alert-badge">🔔 NEW APPLICATION</div>
        </div>
        
        <div class="content">
            <h1 class="greeting">⚠️ New Application Received</h1>
            
            <p class="message">
                A new application has been submitted and requires your review and attention.
            </p>
            
            <div class="application-card">
                <h3>📋 Applicant Information</h3>
                <div class="info-item">
                    <span class="info-label">Name:</span>
                    <span class="info-value">${applicantName}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Email:</span>
                    <span class="info-value">${email}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Phone:</span>
                    <span class="info-value">${phone}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Course Applied:</span>
                    <span class="info-value">${course}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Application #:</span>
                    <span class="info-value"><strong>${applicationNumber}</strong></span>
                </div>
                <div class="info-item">
                    <span class="info-label">Submitted:</span>
                    <span class="info-value">${applicationDate}</span>
                </div>
            </div>
            
            <div class="action-box">
                <h3>📌 Action Required</h3>
                <p>Please review this application in your admin panel and take appropriate action:</p>
                <ul style="margin-left: 20px; color: #856404;">
                    <li>Approve or reject the application</li>
                    <li>Add admin notes if needed</li>
                    <li>Request additional information if required</li>
                </ul>
                <a href="${adminPanelUrl}" class="action-button">Go to Admin Panel</a>
            </div>
            
            <p class="message" style="color: #c0392b; font-weight: 600;">
                ⏰ Please review this application promptly to provide timely feedback to the applicant.
            </p>
        </div>
        
        <div class="footer">
            <p class="footer-text">NAIROBI ZOEZI SCHOOL</p>
            <p class="footer-text">Excellence in Sports & Fitness Education</p>
            <p class="contact">Contact us: admissions@nairobi-zoezi.com | +254 746 139 413</p>
            <p class="footer-text" style="margin-top: 15px;">
                &copy; 2024 Nairobi Zoezi School. All rights reserved.
            </p>
        </div>
    </div>
</body>
</html>
    `;
};

module.exports = {
    transporter,
    generateApplicationConfirmationTemplate,
    generateStatusChangeTemplate,
    generateStudentWelcomeTemplate,
    generatePasswordResetTemplate,
    generateAdminApplicationNotificationTemplate
};
