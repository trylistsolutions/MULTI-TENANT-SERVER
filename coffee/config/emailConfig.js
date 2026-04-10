const nodemailer = require('nodemailer');

const coffeeEmailUser = process.env.COFFEE_EMAIL || process.env.AROBISCA_EMAIL || process.env.EMAIL_USER;
const coffeeEmailPassword = process.env.COFFEE_EMAIL_PASSWORD || process.env.AROBISCA_EMAIL_PASSWORD || process.env.EMAIL_PASSWORD;

// Create transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    port: 465,
    secure: true,
    logger: true,
    debug: false,
    secureConnection: false,
    auth: {
        user: coffeeEmailUser,
        pass: coffeeEmailPassword,
    },
    tls: {
        rejectUnauthorized: true
    }
});

// Email verification template (existing)
const generateVerificationEmailTemplate = (verificationCode, username) => {
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email Verification - Arobisca</title>
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
            background: linear-gradient(135deg, #6f4e37 0%, #8b6b61 100%);
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
            color: #6f4e37;
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
        
        .verification-code {
            background: linear-gradient(135deg, #6f4e37 0%, #8b6b61 100%);
            color: #ffffff;
            font-size: 52px;
            font-weight: 700;
            text-align: center;
            padding: 30px;
            border-radius: 15px;
            letter-spacing: 12px;
            margin: 30px 0;
            box-shadow: 0 10px 30px rgba(111, 78, 55, 0.3);
        }
        
        .instructions {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 10px;
            border-left: 4px solid #6f4e37;
            margin: 30px 0;
        }
        
        .instructions h3 {
            color: #6f4e37;
            margin-bottom: 10px;
            font-size: 18px;
        }
        
        .instructions ul {
            padding-left: 20px;
        }
        
        .instructions li {
            margin-bottom: 8px;
            color: #666;
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
        
        .highlight {
            color: #6f4e37;
            font-weight: 600;
        }
        
        .divider {
            height: 2px;
            background: linear-gradient(90deg, transparent, #6f4e37, transparent);
            margin: 30px 0;
        }
        
        .security-note {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
        }
        
        .security-note h3 {
            color: #856404;
            margin-bottom: 10px;
        }
        
        .security-note p {
            color: #856404;
            font-size: 14px;
        }
        
        @media (max-width: 600px) {
            .container {
                margin: 10px;
            }
            
            .header, .content {
                padding: 30px 20px;
            }
            
            .verification-code {
                font-size: 42px;
                letter-spacing: 8px;
                padding: 25px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">AROBISCA</div>
            <div class="tagline">YOUR PREMIER COFFEE SUPPLIER</div>
        </div>
        
        <div class="content">
            <p class="message" style="text-align: center; font-weight: 500;">
                Your email verification code is:
            </p>
            
            <div class="verification-code">
                ${verificationCode}
            </div>
            
            <div class="instructions">
                <h3>🔒 Important Instructions:</h3>
                <ul>
                    <li>Enter this code on the verification page to complete your registration</li>
                    <li>This code will expire in <strong>1 hour</strong> for security reasons</li>
                    <li>If you didn't request this code, please ignore this email</li>
                    <li>Keep your verification code confidential</li>
                </ul>
            </div>
            
            <p class="message">
                Once verified, you'll have full access to our premium coffee catalog, exclusive offers, 
                and seamless ordering experience.
            </p>
            
            <p class="message" style="text-align: center;">
                Welcome to the Arobisca family! ☕
            </p>
        </div>
        
        <div class="footer">
            <p class="footer-text">AROBISCA - YOUR PREMIER COFFEE SUPPLIER</p>
            <p class="footer-text">Experience coffee perfection in every cup</p>
            <p class="contact">Contact us: support@arobisca.com | +1 (555) 123-COFFEE</p>
            <p class="footer-text" style="margin-top: 15px;">
                &copy; 2024 Arobisca. All rights reserved.
            </p>
        </div>
    </div>
</body>
</html>
  `;
};

// Password reset template (new)
const generatePasswordResetTemplate = (resetCode, username) => {
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset - Arobisca</title>
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
            background: linear-gradient(135deg, #d35400 0%, #e67e22 100%);
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
            color: #d35400;
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
        
        .reset-code {
            background: linear-gradient(135deg, #d35400 0%, #e67e22 100%);
            color: #ffffff;
            font-size: 52px;
            font-weight: 700;
            text-align: center;
            padding: 30px;
            border-radius: 15px;
            letter-spacing: 12px;
            margin: 30px 0;
            box-shadow: 0 10px 30px rgba(211, 84, 0, 0.3);
        }
        
        .instructions {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 10px;
            border-left: 4px solid #d35400;
            margin: 30px 0;
        }
        
        .instructions h3 {
            color: #d35400;
            margin-bottom: 10px;
            font-size: 18px;
        }
        
        .instructions ul {
            padding-left: 20px;
        }
        
        .instructions li {
            margin-bottom: 8px;
            color: #666;
        }
        
        .security-alert {
            background: #ffeaa7;
            border: 2px solid #fdcb6e;
            border-radius: 10px;
            padding: 20px;
            margin: 30px 0;
            text-align: center;
        }
        
        .security-alert h3 {
            color: #e17055;
            margin-bottom: 10px;
            font-size: 18px;
        }
        
        .security-alert p {
            color: #e17055;
            font-size: 14px;
            margin-bottom: 10px;
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
            background: linear-gradient(90deg, transparent, #d35400, transparent);
            margin: 30px 0;
        }
        
        .action-button {
            display: inline-block;
            background: linear-gradient(135deg, #d35400 0%, #e67e22 100%);
            color: white;
            padding: 15px 30px;
            text-decoration: none;
            border-radius: 25px;
            font-weight: 600;
            margin: 20px 0;
            box-shadow: 0 5px 15px rgba(211, 84, 0, 0.3);
        }
        
        @media (max-width: 600px) {
            .container {
                margin: 10px;
            }
            
            .header, .content {
                padding: 30px 20px;
            }
            
            .reset-code {
                font-size: 42px;
                letter-spacing: 8px;
                padding: 25px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">AROBISCA</div>
            <div class="tagline">YOUR PREMIER COFFEE SUPPLIER</div>
        </div>
        
        <div class="content">
            <h1 class="greeting">Password Reset Request</h1>
            
            <p class="message">
                Hello <strong>${username}</strong>, we received a request to reset your password for your Arobisca account. 
                If you didn't make this request, please ignore this email.
            </p>
            
            <div class="divider"></div>
            
            <p class="message" style="text-align: center; font-weight: 500;">
                Your password reset code is:
            </p>
            
            <div class="reset-code">
                ${resetCode}
            </div>
            
            <div class="instructions">
                <h3>🔑 Reset Instructions:</h3>
                <ul>
                    <li>Enter this code on the password reset page</li>
                    <li>This code will expire in <strong>1 hour</strong> for security</li>
                    <li>After verification, you can set a new password</li>
                    <li>Choose a strong password that you haven't used before</li>
                </ul>
            </div>
            
            <div class="security-alert">
                <h3>⚠️ Security Alert</h3>
                <p>For your security, never share this code with anyone.</p>
                <p>Arobisca will never ask for your password or verification codes.</p>
            </div>
            
            <p class="message" style="text-align: center;">
                Need help? Contact our support team immediately if you didn't request this change.
            </p>
            
            <div style="text-align: center;">
                <p class="message" style="margin-bottom: 10px;">
                    Stay secure,<br>
                    <strong>The Arobisca Team</strong>
                </p>
            </div>
        </div>
        
        <div class="footer">
            <p class="footer-text">AROBISCA - YOUR PREMIER COFFEE SUPPLIER</p>
            <p class="footer-text">Experience coffee perfection in every cup</p>
            <p class="contact">Contact us: support@arobisca.com | +254 724 637787</p>
            <p class="footer-text" style="margin-top: 15px;">
                &copy; 2024 Arobisca. All rights reserved.
            </p>
        </div>
    </div>
</body>
</html>
  `;
};

module.exports = {
  transporter,
  generateVerificationEmailTemplate,
  generatePasswordResetTemplate
};