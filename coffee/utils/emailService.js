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

// Order confirmation email template
const generateOrderConfirmationEmail = (order, user, generatedPassword = null, accountType = 'personal') => {
  const itemsHTML = order.items.map(item => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">
        <img src="${item.image}" alt="${item.name}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px;">
      </td>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">
        <strong>${item.name}</strong><br>
        <small>Qty: ${item.quantity}</small>
      </td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">
        KES ${((item.offerPrice || item.price) * item.quantity).toLocaleString()}
      </td>
    </tr>
  `).join('');

  const discountHTML = order.discount > 0 ? `
    <tr>
      <td colspan="2" style="padding: 10px; text-align: right;"><strong>Discount:</strong></td>
      <td style="padding: 10px; text-align: right; color: #10b981;">- KES ${order.discount.toLocaleString()}</td>
    </tr>
  ` : '';

  // Enhanced account info with account type
  const accountInfoHTML = generatedPassword ? `
    <div style="background: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 8px; padding: 15px; margin: 20px 0;">
      <h4 style="color: #0ea5e9; margin-bottom: 10px;">Your ${accountType === 'business' ? 'Business ' : ''}Account Has Been Created!</h4>
      <p style="margin: 5px 0;"><strong>Username:</strong> ${user.username}</p>
      <p style="margin: 5px 0;"><strong>Password:</strong> ${generatedPassword}</p>
      <p style="margin: 5px 0;"><strong>Account Type:</strong> ${accountType === 'business' ? 'Business Account' : 'Personal Account'}</p>
      ${accountType === 'business' && user.companyName ? `<p style="margin: 5px 0;"><strong>Company:</strong> ${user.companyName}</p>` : ''}
      <p style="margin: 10px 0 0 0; font-size: 14px; color: #666;">
        You can use these credentials to log in and track your orders. We recommend changing your password after first login.
      </p>
    </div>
  ` : '';

  // Credit terms info
  const creditTermsHTML = order.paymentMethod === 'credit' && order.creditTerms ? `
    <div style="background: #e0f2fe; border: 1px solid #0284c7; border-radius: 8px; padding: 15px; margin: 15px 0;">
      <h4 style="color: #0369a1; margin-bottom: 10px;">Credit Purchase Terms</h4>
      <p style="margin: 5px 0;"><strong>Credit Period:</strong> ${order.creditTerms.creditDays} Days</p>
      <p style="margin: 5px 0;"><strong>Payment Method:</strong> ${order.creditTerms.paymentMethod.replace('_', ' ').toUpperCase()}</p>
      <p style="margin: 10px 0 0 0; font-size: 14px; color: #0369a1;">
        Your order will be processed on credit terms. Please ensure payment is made within ${order.creditTerms.creditDays} days.
      </p>
    </div>
  ` : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 1200px; margin: 0 auto; padding: 5px; }
        .header { background: linear-gradient(135deg, #d97706, #6f4e37); color: white; padding: 10px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 10px; border-radius: 0 0 10px 10px; }
        .order-details { background: white; padding: 10px; border-radius: 8px; margin: 20px 0; }
        .status-badge { display: inline-block; padding: 2px 5px; background: #f59e0b; color: white; border-radius: 20px; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; }
        .total-row { border-top: 2px solid #d97706; font-weight: bold; }
        .tracking-link { background: #d97706; color: white; padding: 6px 12px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>AROBISCA COFFEE</h1>
          <h2>Order Confirmation</h2>
          <p>Thank you for your order!</p>
        </div>
        
        <div class="content">
          <div style="text-align: center; margin-bottom: 20px;">
            <span class="status-badge">Order #${order.orderNumber}</span>
            <p>Order Date: ${new Date(order.orderDate).toLocaleDateString()}</p>
          </div>

          ${accountInfoHTML}
          ${creditTermsHTML}

          <div class="order-details">
            <h3 style="color: #d97706; margin-bottom: 15px;">Order Summary</h3>
            <table>
              ${itemsHTML}
              <tr>
                <td colspan="2" style="padding: 10px; text-align: right;"><strong>Subtotal:</strong></td>
                <td style="padding: 10px; text-align: right;">KES ${order.subtotal.toLocaleString()}</td>
              </tr>
${discountHTML}
<!-- Add VAT line -->
${order.vatTotal > 0 ? `
<tr>
  <td colspan="2" style="padding: 10px; text-align: right;"><strong>VAT:</strong></td>
  <td style="padding: 10px; text-align: right;">KES ${order.vatTotal.toLocaleString()}</td>
</tr>
` : ''}
<tr>
  <td colspan="2" style="padding: 10px; text-align: right;"><strong>Shipping:</strong></td>
  <td style="padding: 10px; text-align: right;">KES ${order.shipping.toLocaleString()}</td>
</tr>
<tr class="total-row">
  <td colspan="2" style="padding: 15px; text-align: right;"><strong>Total:</strong></td>
  <td style="padding: 15px; text-align: right; color: #d97706; font-size: 18px;">
    KES ${order.total.toLocaleString()}
  </td>
</tr>
            </table>
          </div>

          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #d97706; margin-bottom: 15px;">Delivery Information</h3>
            <p><strong>Shipping Address:</strong><br>
            ${order.shippingAddress.firstName} ${order.shippingAddress.lastName}<br>
            ${order.shippingAddress.address}<br>
            ${order.shippingAddress.city} ${order.shippingAddress.postalCode}<br>
            Phone: ${order.shippingAddress.phone}
            </p>
            
            <p><strong>Delivery Time:</strong> ${order.deliveryTime}</p>
            <p><strong>Payment Method:</strong> ${order.paymentMethod === 'mpesa' ? 'M-Pesa' : order.paymentMethod === 'credit' ? 'Credit Purchase' : 'Cash on Delivery'}</p>
            <p><strong>Payment Status:</strong> ${order.paymentStatus}</p>
            
            ${order.deliveryNote ? `
            <p><strong>Delivery Note:</strong> ${order.deliveryNote}</p>
            ` : ''}
          </div>

          <div style="text-align: center; margin-top: 30px; padding: 20px; background: #fffbeb; border-radius: 8px;">
            <h4 style="color: #d97706; margin-bottom: 10px;">Track Your Order</h4>
            <p>You can track your order status and view order history by visiting your dashboard:</p>
            <a href="${process.env.FRONTEND_URL}/dashboard?tab=orders" class="tracking-link">
              View Order Dashboard
            </a>
            <p style="margin-top: 15px; font-size: 14px; color: #666;">
              We'll notify you via email when your order status changes.
            </p>
          </div>

          <div style="text-align: center; margin-top: 30px; padding: 20px; background: #f0fdf4; border-radius: 8px;">
            <h4 style="color: #16a34a; margin-bottom: 10px;">What's Next?</h4>
            <p>We're preparing your order and will notify you when it's on its way.</p>
            <p>For any questions, contact us at coffeearobisca@gmail.com</p>
            <p>+254 795 982 056 || +254 724 637 787 || +254 701 345 482</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Status update email template
const generateStatusUpdateEmail = (order, oldStatus, newStatus, adminNotes = null) => {
  const statusInfo = {
    confirmed: {
      title: "Order Confirmed ✅",
      message: "Your order has been confirmed! We're preparing your items for dispatch.",
      color: "#22c55e",
    },
    processing: {
      title: "Processing Your Order ☕",
      message: "Our team is packaging your Arobisca goodies with care.",
      color: "#3b82f6",
    },
    shipped: {
      title: "On the Way 🚚",
      message: `Your order has been shipped! Expected delivery: <strong>${order.deliveryTime}</strong>.`,
      color: "#d97706",
    },
    delivered: {
      title: "Delivered Successfully 🎉",
      message: "Your order has been delivered. We hope you enjoy every sip of Arobisca Coffee!",
      color: "#16a34a",
    },
    cancelled: {
      title: "Order Cancelled ❌",
      message: "Your order has been cancelled. If this was a mistake, please contact our support team.",
      color: "#dc2626",
    },
  };

  const { title, message, color } = statusInfo[newStatus] || {
    title: "Order Update",
    message: "Your order status has been updated.",
    color: "#3e2723",
  };

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body { font-family: 'Poppins', Arial, sans-serif; background: #f9fafb; color: #333; margin: 0; }
      .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
      .header { background: linear-gradient(135deg, #d35400, #f59e0b); color: #fff; padding: 20px 30px; text-align: center; }
      .header h1 { margin: 0; font-size: 24px; letter-spacing: 1px; }
      .content { padding: 30px; text-align: center; }
      .status-badge { background: ${color}; color: white; padding: 12px 24px; border-radius: 30px; display: inline-block; font-weight: 600; margin: 10px 0; }
      .notes { background: #fff8e1; border-left: 5px solid #f59e0b; padding: 15px; margin-top: 20px; text-align: left; border-radius: 6px; }
      a.btn { background: #3e2723; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; display: inline-block; margin-top: 20px; }
      footer { margin-top: 30px; font-size: 13px; color: #777; text-align: center; padding-bottom: 10px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>AROBISCA COFFEE</h1>
        <p>Order #${order.orderNumber}</p>
      </div>
      <div class="content">
        <h2 style="color:${color}; margin-bottom: 8px;">${title}</h2>
        <div class="status-badge">${newStatus.toUpperCase()}</div>
        <p>${message}</p>

        ${adminNotes
      ? `<div class="notes">
                <strong>Note from Arobisca Team:</strong><br>
                ${adminNotes}
              </div>`
      : ""
    }

        <a href="${process.env.FRONTEND_URL}/dashboard?tab=orders" class="btn">View My Orders</a>
      </div>
      <footer>
        &copy; ${new Date().getFullYear()} Arobisca Coffee. All rights reserved.
      </footer>
    </div>
  </body>
  </html>
  `;
};

// Admin notification email template
const generateAdminOrderNotificationEmail = (order, user) => {
    // Calculate itemized VAT for admin view
    const itemsHTML = order.items.map(item => {
        const itemPrice = item.offerPrice || item.price || 0;
        const itemTotal = itemPrice * item.quantity;
        const itemVAT = item.product?.vat || 0;
        const itemVATAmount = (itemTotal * itemVAT) / 100;
        
        return `
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px; vertical-align: top;">
                <img src="${item.image}" alt="${item.name}" 
                     style="width: 50px; height: 50px; object-fit: cover; border-radius: 5px;">
            </td>
            <td style="padding: 10px; vertical-align: top;">
                <strong>${item.name}</strong><br>
                <small>Qty: ${item.quantity}</small><br>
                <small>Price: KES ${itemPrice.toLocaleString()} each</small>
            </td>
            <td style="padding: 10px; vertical-align: top; text-align: right;">
                KES ${itemTotal.toLocaleString()}<br>
                ${itemVAT > 0 ? `<small style="color: #666;">VAT ${itemVAT}%: KES ${itemVATAmount.toFixed(2)}</small>` : ''}
            </td>
        </tr>
        `;
    }).join('');

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 800px; margin: 0 auto; padding: 20px; }
            .header { background: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 20px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; }
            .alert-box { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 15px 0; }
            .customer-info { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #e5e7eb; }
            table { width: 100%; border-collapse: collapse; }
            .total-row { border-top: 2px solid #dc2626; font-weight: bold; }
            .status-badge { 
                background: ${order.paymentStatus === 'paid' ? '#10b981' : '#f59e0b'}; 
                color: white; 
                padding: 5px 10px; 
                border-radius: 20px; 
                font-size: 12px; 
                display: inline-block; 
            }
            .button { 
                background: #dc2626; 
                color: white; 
                padding: 10px 20px; 
                text-decoration: none; 
                border-radius: 5px; 
                display: inline-block; 
                margin: 10px 0; 
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🛎️ NEW ORDER NOTIFICATION</h1>
                <h2>Order #${order.orderNumber}</h2>
            </div>
            
            <div class="content">
                <div class="alert-box">
                    <h3 style="color: #dc2626; margin-top: 0;">ACTION REQUIRED</h3>
                    <p>A new order has been placed and requires processing.</p>
                </div>
                
                <div class="customer-info">
                    <h3 style="color: #1e40af; margin-top: 0;">Customer Information</h3>
                    <p><strong>Customer:</strong> ${user.username}</p>
                    <p><strong>Email:</strong> ${user.email}</p>
                    <p><strong>Phone:</strong> ${user.phoneNumber || order.shippingAddress.phone}</p>
                    <p><strong>Account Type:</strong> ${user.accountType === 'business' ? 'Business Account' : 'Personal Account'}</p>
                    ${user.accountType === 'business' && user.companyName ? `<p><strong>Company:</strong> ${user.companyName}</p>` : ''}
                    <span class="status-badge">
                        ${order.paymentStatus === 'paid' ? 'PAID' : 'PENDING PAYMENT'}
                    </span>
                </div>
                
                <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #e5e7eb;">
                    <h3 style="color: #1e40af; margin-top: 0;">Order Details</h3>
                    <table>
                        <thead>
                            <tr style="background: #f3f4f6;">
                                <th style="padding: 10px; text-align: left;">Item</th>
                                <th style="padding: 10px; text-align: left;">Description</th>
                                <th style="padding: 10px; text-align: right;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHTML}
                        </tbody>
                    </table>
                    
                    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                        <table>
                            <tr>
                                <td style="padding: 10px; text-align: right;"><strong>Subtotal:</strong></td>
                                <td style="padding: 10px; text-align: right; width: 120px;">KES ${order.subtotal.toLocaleString()}</td>
                            </tr>
                            ${order.discount > 0 ? `
                            <tr>
                                <td style="padding: 10px; text-align: right;"><strong>Discount:</strong></td>
                                <td style="padding: 10px; text-align: right; color: #10b981;">- KES ${order.discount.toLocaleString()}</td>
                            </tr>
                            ` : ''}
                            ${order.vatTotal > 0 ? `
                            <tr>
                                <td style="padding: 10px; text-align: right;"><strong>VAT Total:</strong></td>
                                <td style="padding: 10px; text-align: right;">KES ${order.vatTotal.toLocaleString()}</td>
                            </tr>
                            ` : ''}
                            <tr>
                                <td style="padding: 10px; text-align: right;"><strong>Shipping:</strong></td>
                                <td style="padding: 10px; text-align: right;">KES ${order.shipping.toLocaleString()}</td>
                            </tr>
                            <tr class="total-row">
                                <td style="padding: 15px; text-align: right;"><strong>TOTAL AMOUNT:</strong></td>
                                <td style="padding: 15px; text-align: right; color: #dc2626; font-size: 18px;">
                                    KES ${order.total.toLocaleString()}
                                </td>
                            </tr>
                        </table>
                    </div>
                </div>
                
                <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #e5e7eb;">
                    <h3 style="color: #1e40af; margin-top: 0;">Delivery & Payment</h3>
                    <p><strong>Shipping Address:</strong><br>
                    ${order.shippingAddress.firstName} ${order.shippingAddress.lastName}<br>
                    ${order.shippingAddress.address}<br>
                    ${order.shippingAddress.city} ${order.shippingAddress.postalCode}<br>
                    Phone: ${order.shippingAddress.phone}
                    </p>
                    
                    <p><strong>Delivery Time:</strong> ${order.deliveryTime}</p>
                    <p><strong>Payment Method:</strong> ${order.paymentMethod === 'mpesa' ? 'M-Pesa' : order.paymentMethod === 'credit' ? 'Credit Purchase' : 'Cash on Delivery'}</p>
                    
                    ${order.paymentMethod === 'credit' && order.creditTerms ? `
                    <div style="background: #e0f2fe; padding: 10px; border-radius: 5px; margin: 10px 0;">
                        <p><strong>Credit Terms:</strong> ${order.creditTerms.creditDays} days via ${order.creditTerms.paymentMethod}</p>
                    </div>
                    ` : ''}
                    
                    ${order.deliveryNote ? `
                    <div style="background: #fef3c7; padding: 10px; border-radius: 5px; margin: 10px 0;">
                        <p><strong>Customer Note:</strong> ${order.deliveryNote}</p>
                    </div>
                    ` : ''}
                </div>
                
                <div style="text-align: center; margin-top: 30px; padding: 20px; background: #fef2f2; border-radius: 8px;">
                    <h4 style="color: #dc2626; margin-bottom: 15px;">Quick Actions</h4>
                    <a href="${process.env.FRONTEND_URL}/a8f3k9-mgmt-portal/orders" class="button">
                        View Order in Admin Panel
                    </a>
                    <p style="margin-top: 15px; font-size: 14px; color: #666;">
                        Order placed: ${new Date(order.orderDate).toLocaleString()}<br>
                        Order ID: ${order._id}
                    </p>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
};

// Send email function
const sendEmail = async (to, subject, html) => {
  try {
    const mailOptions = {
      from: process.env.COFFEE_EMAIL || process.env.EMAIL_FROM || coffeeEmailUser || 'AROBISCA COFFEE <noreply@arobisca.com>',
      to,
      subject,
      html
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${to}`);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

module.exports = {
    sendEmail,
    generateOrderConfirmationEmail,
    generateStatusUpdateEmail,
    generateAdminOrderNotificationEmail // Add this
};