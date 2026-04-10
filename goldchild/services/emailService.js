const nodemailer = require('nodemailer');

// Create transporter for Gmail using Goldchild credentials
const transporter = nodemailer.createTransport({
  service: 'gmail',
  port: 465,
  secure: true,
  logger: true,
  debug: false,
  secureConnection: false,
  auth: {
    user: process.env.GOLDCHILD_EMAIL,
    pass: process.env.GOLDCHILD_EMAIL_PASSWORD
  },
  tls: {
    rejectUnauthorized: true
  }
});

// Verify transporter connection
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Email transporter error:', error);
  } else {
    console.log('✅ Email service ready');
  }
});

/**
 * Send application confirmation email
 * @param {string} email - Applicant email
 * @param {string} name - Applicant name
 * @param {string} applicationNumber - Application reference number
 */
const sendApplicationConfirmationEmail = async (email, name, applicationNumber) => {
  try {
    const mailOptions = {
      from: process.env.GOLDCHILD_EMAIL || 'goldchildteam@gmail.com',
      to: email,
      subject: '📬 Application Confirmation - Goldchild School',
      html: generateApplicationConfirmationTemplate(name, applicationNumber)
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Application confirmation email sent to:', email);
    return result;
  } catch (error) {
    console.error('❌ Failed to send application confirmation email:', error);
    throw error;
  }
};

/**
 * Send acceptance email
 * @param {string} email - Student email
 * @param {string} name - Student name
 * @param {string} admissionNumber - Admission number
 * @param {string} courseName - Course name
 * @param {string} startDate - Course start date
 * @param {number} upfrontFee - Upfront fee paid
 * @param {number} totalFee - Total course fee
 */
const sendAcceptanceEmail = async (email, name, admissionNumber, courseName, startDate, upfrontFee = 0, totalFee = 0) => {
  try {
    const mailOptions = {
      from: process.env.GOLDCHILD_EMAIL || 'goldchildteam@gmail.com',
      to: email,
      subject: '🎉 Congratulations! Your Application Has Been Accepted - Goldchild School',
      html: generateAcceptanceTemplate(name, admissionNumber, courseName, startDate, upfrontFee, totalFee)
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Acceptance email sent to:', email);
    return result;
  } catch (error) {
    console.error('❌ Failed to send acceptance email:', error);
    throw error;
  }
};

/**
 * Send rejection email
 * @param {string} email - Student email
 * @param {string} name - Student name
 * @param {string} rejectionReason - Reason for rejection
 */
const sendRejectionEmail = async (email, name, rejectionReason) => {
  try {
    const mailOptions = {
      from: process.env.GOLDCHILD_EMAIL || 'goldchildteam@gmail.com',
      to: email,
      subject: '📬 Application Status Update - Goldchild School',
      html: generateRejectionTemplate(name, rejectionReason)
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Rejection email sent to:', email);
    return result;
  } catch (error) {
    console.error('❌ Failed to send rejection email:', error);
    throw error;
  }
};

/**
 * Send admin notification email about new application
 * @param {string} applicantName - Student name
 * @param {string} applicationNumber - Application reference number
 * @param {string} courseName - Applied course
 */
const sendAdminNotificationEmail = async (applicantName, applicationNumber, courseName) => {
  try {
    const adminEmail = process.env.GOLDCHILD_ADMIN_EMAIL || 'goldchildteam@gmail.com';
    const adminCcEmail = process.env.GOLDCHILD_ADMIN_CC_EMAIL || '';

    const mailOptions = {
      from: process.env.GOLDCHILD_EMAIL || 'goldchildteam@gmail.com',
      to: adminEmail,
      ...(adminCcEmail && { cc: adminCcEmail }),
      subject: `📬 New Application Received! - ${applicantName}`,
      html: generateAdminNotificationTemplate(applicantName, applicationNumber, courseName)
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Admin notification email sent to:', adminEmail, adminCcEmail ? `and CC: ${adminCcEmail}` : '');
    return result;
  } catch (error) {
    console.error('❌ Failed to send admin notification email:', error);
    // Don't throw - this is a background task
    return null;
  }
};

/**
 * Send manual admission email to student
 * @param {string} email - Student email
 * @param {string} name - Student name
 * @param {string} admissionNumber - Admission number
 * @param {string} courseName - Course name
 * @param {number} upfrontFee - Upfront fee paid
 * @param {number} totalFee - Total course fee
 */
const sendManualAdmissionEmail = async (email, name, admissionNumber, courseName, upfrontFee = 0, totalFee = 0) => {
  try {
    const mailOptions = {
      from: process.env.GOLDCHILD_EMAIL || 'goldchildteam@gmail.com',
      to: email,
      subject: '🎉 Welcome to Goldchild Media Institute!',
      html: generateManualAdmissionTemplate(name, admissionNumber, courseName, upfrontFee, totalFee)
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Manual admission email sent to:', email);
    return result;
  } catch (error) {
    console.error('❌ Failed to send manual admission email:', error);
    throw error;
  }
};

/**
 * Application confirmation email template
 */
const generateApplicationConfirmationTemplate = (applicantName, applicationNumber) => {
  const frontendUrl = process.env.GOLDCHILD_FRONTEND_URL || 'https://goldchildschool.com';
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #dc9320 0%, #142841 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { background: #ffffff; padding: 30px; border-radius: 0 0 8px 8px; }
          .info-box { background: #f5f5f5; padding: 20px; margin: 20px 0; border-left: 4px solid #dc9320; }
          .info-label { font-weight: bold; color: #142841; font-size: 14px; }
          .info-value { font-size: 16px; margin-top: 5px; color: #333; }
          .footer { text-align: center; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
          .button { display: inline-block; background: #dc9320; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✓ Application Received!</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${applicantName}</strong>,</p>
            
            <p>Thank you for submitting your application to <strong>Goldchild Media Institute</strong>! We are excited to review your application.</p>
            
            <div class="info-box">
              <div class="info-label">Application Number:</div>
              <div class="info-value">${applicationNumber}</div>
            </div>
            
            <p>We have received your application and our admin team is currently reviewing it. You will be notified via email once we have made a decision.</p>
            
            <p><strong>What happens next?</strong></p>
            <ul>
              <li>Our team will review your application carefully</li>
              <li>We will assess your qualifications and fit for the course</li>
              <li>You will receive an email with our decision within 5-7 business days</li>
            </ul>
            
            <p>If you have any questions in the meantime, please don't hesitate to contact us.</p>
            
            <a href="${frontendUrl}" class="button">Visit Our Website</a>
            
            <div class="footer">
              <p><strong>Goldchild Media Institute</strong></p>
              <p>Email: ${process.env.GOLDCHILD_EMAIL || 'goldchildteam@gmail.com'}</p>
              <p>Website: ${frontendUrl}</p>
              <p>&copy; ${new Date().getFullYear()} Goldchild Media Institute. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
};

/**
 * Acceptance email template with fees
 */
const generateAcceptanceTemplate = (studentName, admissionNumber, courseName, startDate, upfrontFee = 0, totalFee = 0) => {
  const frontendUrl = process.env.GOLDCHILD_FRONTEND_URL || 'https://goldchildschool.com';
  const balanceDue = totalFee - upfrontFee;
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #000; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #dc9320 0%, #142841 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { background: #ffffff; padding: 30px; border-radius: 0 0 8px 8px; }
          .info-box { background: #f5f5f5; padding: 20px; margin: 20px 0; border-left: 4px solid #dc9320; }
          .fee-box { background: #fff9f0; padding: 20px; margin: 20px 0; border: 2px solid #dc9320; border-radius: 5px; }
          .info-label { font-weight: bold; color: #142841; font-size: 14px; }
          .info-value { font-size: 16px; margin-top: 5px; color: #000; }
          .fee-label { font-weight: bold; color: #142841; font-size: 13px; margin-bottom: 8px; }
          .fee-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #ddd; }
          .fee-row:last-child { border-bottom: none; }
          .footer { text-align: center; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
          .button { display: inline-block; background: #dc9320; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
          .congrats { font-size: 24px; color: #dc9320; font-weight: bold; text-align: center; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Congratulations!</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${studentName}</strong>,</p>
            
            <div class="congrats">Your application has been accepted!</div>
            
            <p>We are delighted to inform you that your application to <strong>Goldchild Media Institute</strong> has been <strong>ACCEPTED</strong>!</p>
            
            <p>Here are your admission details:</p>
            
            <div class="info-box">
              <div class="info-label">Admission Number:</div>
              <div class="info-value">${admissionNumber}</div>
            </div>
            
            <div class="info-box">
              <div class="info-label">Course:</div>
              <div class="info-value">${courseName}</div>
            </div>
            
            <div class="info-box">
              <div class="info-label">Start Date:</div>
              <div class="info-value">${startDate || 'To be confirmed'}</div>
            </div>
            
            ${totalFee > 0 ? `
            <div class="fee-box">
              <div class="fee-label">💰 Fee Details:</div>
              <div class="fee-row">
                <span>Total Course Fee:</span>
                <strong>KES ${totalFee.toLocaleString()}</strong>
              </div>
              <div class="fee-row">
                <span>Upfront Payment:</span>
                <strong style="color: #11998e;">KES ${upfrontFee.toLocaleString()}</strong>
              </div>
              <div class="fee-row" style="margin-top: 10px; padding-top: 10px; border-top: 2px solid #dc9320;">
                <span><strong>Balance Due:</strong></span>
                <strong style="color: #e74c3c; font-size: 18px;">KES ${balanceDue.toLocaleString()}</strong>
              </div>
            </div>
            ` : ''}
            
            <p><strong>Next Steps:</strong></p>
            <ul>
              <li>Review your admission details carefully</li>
              <li>Complete any remaining registration requirements</li>
              <li>Submit any outstanding documentation</li>
              ${balanceDue > 0 ? `<li>Pay the remaining balance of KES ${balanceDue.toLocaleString()}</li>` : '<li>Congratulations on completing payment!</li>'}
            </ul>
            
            <p>We look forward to welcoming you to our Goldchild Media Institute community!</p>
            
            <a href="${frontendUrl}" class="button">Visit Portal</a>
            
            <div class="footer">
              <p><strong>Goldchild Media Institute</strong></p>
              <p>Email: ${process.env.GOLDCHILD_EMAIL || 'goldchildteam@gmail.com'}</p>
              <p>Website: ${frontendUrl}</p>
              <p>&copy; ${new Date().getFullYear()} Goldchild Media Institute. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
};

/**
 * Rejection email template
 */
const generateRejectionTemplate = (studentName, rejectionReason) => {
  const frontendUrl = process.env.GOLDCHILD_FRONTEND_URL || 'https://goldchildschool.com';
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #000; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #dc9320 0%, #142841 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .header h1 { margin: 0; font-size: 24px; }
          .content { background: #ffffff; padding: 30px; border-radius: 0 0 8px 8px; }
          .info-box { background: #f5f5f5; padding: 20px; margin: 20px 0; border-left: 4px solid #dc9320; }
          .reason-box { background: #fff9f0; padding: 20px; margin: 20px 0; border-left: 4px solid #dc9320; border-radius: 5px; }
          .footer { text-align: center; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
          .button { display: inline-block; background: #dc9320; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Application Status Update</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${studentName}</strong>,</p>
            
            <p>Thank you for your application to <strong>Goldchild Media Institute</strong>. We appreciate the time and effort you put into your submission.</p>
            
            <p>After careful consideration, we regret to inform you that your application has not been successful at this time.</p>
            
            ${rejectionReason ? `
            <div class="reason-box">
              <strong style="color: #142841;">📋 Feedback from Admin:</strong>
              <p>${rejectionReason}</p>
            </div>
            ` : ''}
            
            <p><strong>What can you do?</strong></p>
            <ul>
              <li>Consider applying again in the future</li>
              <li>Review the feedback provided and work on those areas</li>
              <li>Contact us if you have any questions about your application</li>
              <li>Explore other courses that might be a better fit</li>
            </ul>
            
            <p>We encourage you not to be discouraged. We would be happy to discuss alternative options with you.</p>
            
            <a href="${frontendUrl}" class="button">Contact Us</a>
            
            <div class="footer">
              <p><strong>Goldchild Media Institute</strong></p>
              <p>Email: ${process.env.GOLDCHILD_EMAIL || 'goldchildteam@gmail.com'}</p>
              <p>Website: ${frontendUrl}</p>
              <p>&copy; ${new Date().getFullYear()} Goldchild Media Institute. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
};

/**
 * Admin notification email template
 */
const generateAdminNotificationTemplate = (applicantName, applicationNumber, courseName) => {
  const frontendUrl = process.env.GOLDCHILD_FRONTEND_URL || 'https://goldchildschool.com';
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #000; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #142841 0%, #dc9320 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .header h1 { margin: 0; font-size: 20px; }
          .content { background: #ffffff; padding: 30px; border-radius: 0 0 8px 8px; }
          .alert { background: #fff9f0; padding: 15px; margin: 20px 0; border-left: 4px solid #dc9320; border-radius: 5px; }
          .info-box { background: #f5f5f5; padding: 20px; margin: 20px 0; border-left: 4px solid #dc9320; }
          .info-label { font-weight: bold; color: #142841; font-size: 14px; }
          .info-value { font-size: 16px; margin-top: 5px; color: #000; }
          .footer { text-align: center; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
          .button { display: inline-block; background: #dc9320; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📬 New Application Received</h1>
          </div>
          <div class="content">
            <p>Hello Admin,</p>
            
            <div class="alert">
              <strong style="color: #dc9320; font-size: 18px;">⚠️ New Application Pending Review</strong>
              <p style="margin: 10px 0 0 0;">A new student application requires your attention.</p>
            </div>
            
            <div class="info-box">
              <div class="info-label">Applicant Name:</div>
              <div class="info-value">${applicantName}</div>
            </div>
            
            <div class="info-box">
              <div class="info-label">Application Number:</div>
              <div class="info-value">${applicationNumber}</div>
            </div>
            
            <div class="info-box">
              <div class="info-label">Applied Course:</div>
              <div class="info-value">${courseName}</div>
            </div>
            
            <div class="info-box">
              <div class="info-label">Submitted:</div>
              <div class="info-value">${new Date().toLocaleString()}</div>
            </div>
            
            <p><strong>Action Required:</strong></p>
            <ul>
              <li>Review the application details in the admin portal</li>
              <li>Verify applicant information and qualifications</li>
              <li>Approve or request more information</li>
              <li>Communicate decision to the applicant</li>
            </ul>
            
            <a href="${frontendUrl}/admin" class="button">Review Applications</a>
            
            <div class="footer">
              <p><strong>Goldchild Media Institute - Admin Panel</strong></p>
              <p>&copy; ${new Date().getFullYear()} Goldchild Media Institute. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
};

/**
 * Manual admission email template with fees
 */
const generateManualAdmissionTemplate = (studentName, admissionNumber, courseName, upfrontFee = 0, totalFee = 0) => {
  const frontendUrl = process.env.GOLDCHILD_FRONTEND_URL || 'https://goldchildschool.com';
  const balanceDue = totalFee - upfrontFee;
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #000; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #dc9320 0%, #142841 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { background: #ffffff; padding: 30px; border-radius: 0 0 8px 8px; }
          .info-box { background: #f5f5f5; padding: 20px; margin: 20px 0; border-left: 4px solid #dc9320; }
          .fee-box { background: #fff9f0; padding: 20px; margin: 20px 0; border: 2px solid #dc9320; border-radius: 5px; }
          .info-label { font-weight: bold; color: #142841; font-size: 14px; }
          .info-value { font-size: 16px; margin-top: 5px; color: #000; }
          .welcome { font-size: 20px; color: #dc9320; font-weight: bold; text-align: center; margin: 20px 0; }
          .fee-label { font-weight: bold; color: #142841; font-size: 13px; margin-bottom: 8px; }
          .fee-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #ddd; }
          .fee-row:last-child { border-bottom: none; }
          .footer { text-align: center; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
          .button { display: inline-block; background: #dc9320; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎓 Welcome Aboard!</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${studentName}</strong>,</p>
            
            <div class="welcome">Welcome to Goldchild Media Institute!</div>
            
            <p>We are thrilled to inform you that you have been admitted to our institute. Your enrollment has been processed and we look forward to your successful academic journey with us.</p>
            
            <p>Here are your admission details:</p>
            
            <div class="info-box">
              <div class="info-label">Admission Number:</div>
              <div class="info-value">${admissionNumber}</div>
            </div>
            
            <div class="info-box">
              <div class="info-label">Course:</div>
              <div class="info-value">${courseName}</div>
            </div>
            
            ${totalFee > 0 ? `
            <div class="fee-box">
              <div class="fee-label">💰 Fee Details:</div>
              <div class="fee-row">
                <span>Total Course Fee:</span>
                <strong>KES ${totalFee.toLocaleString()}</strong>
              </div>
              <div class="fee-row">
                <span>Upfront Payment:</span>
                <strong style="color: #11998e;">KES ${upfrontFee.toLocaleString()}</strong>
              </div>
              <div class="fee-row" style="margin-top: 10px; padding-top: 10px; border-top: 2px solid #dc9320;">
                <span><strong>Balance Due:</strong></span>
                <strong style="color: #e74c3c; font-size: 18px;">KES ${balanceDue.toLocaleString()}</strong>
              </div>
            </div>
            ` : ''}
            
            <p><strong>Important Next Steps:</strong></p>
            <ul>
              <li>Complete your student profile in the portal</li>
              <li>Review the course schedule and requirements</li>
              <li>Submit any required documentation</li>
              ${balanceDue > 0 ? `<li>Pay the remaining balance of KES ${balanceDue.toLocaleString()}</li>` : '<li>Congratulations on completing your payment!</li>'}
              <li>Attend orientation (date to be confirmed)</li>
            </ul>
            
            <p>If you have any questions or need assistance, please don't hesitate to contact our student services team.</p>
            
            <a href="${frontendUrl}" class="button">Visit website</a>
            
            <div class="footer">
              <p><strong>Goldchild Media Institute</strong></p>
              <p>Email: ${process.env.GOLDCHILD_EMAIL || 'goldchildteam@gmail.com'}</p>
              <p>Website: ${frontendUrl}</p>
              <p>&copy; ${new Date().getFullYear()} Goldchild Media Institute. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
};

module.exports = {
  sendApplicationConfirmationEmail,
  sendAcceptanceEmail,
  sendRejectionEmail,
  sendAdminNotificationEmail,
  sendManualAdmissionEmail,
  generateApplicationConfirmationTemplate,
  generateAcceptanceTemplate,
  generateRejectionTemplate,
  generateAdminNotificationTemplate,
  generateManualAdmissionTemplate
};
