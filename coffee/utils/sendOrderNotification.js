const nodemailer = require('nodemailer');

const sendOrderNotification = async (order) => {
    try {
        const transporter = nodemailer.createTransport({
            service: 'Zoho',
            host: 'smtp.zoho.com',
            port: 465,
            secure: true,
            auth: {
                user: process.env.PLAYBOX_EMAIL, // e.g., info@playbox.co.ke
                pass: process.env.PLAYBOX_EMAIL_PASSWORD
            },
        });

        const mailOptions = {
            from: '"Playbox Orders" <info@playbox.co.ke>',
            to: 'sales@playbox.co.ke',
            subject: `New Order Placed (Order ID: ${order._id})`,
            html: `
                <h3>New Order Notification !!</h3>
                <p><strong>Total:</strong> KSh ${order.total}</p>
                <p><strong>Shipping:</strong> ${order.shippingMethod}</p>
                <p><strong>Payment:</strong> ${order.paymentMethod}</p>
                <p><strong>Delivery Note:</strong> ${order.specialDeliveryNote || 'N/A'}</p>
                <p><strong>Items:</strong></p>
                <ul>
                    ${order.products.map(p => `<li>${p.quantity} x ${p.name} (${p.color}) - KSh ${p.price}</li>`).join('')}
                </ul>
            `
        };

        await transporter.sendMail(mailOptions);
        return true;
    } catch (err) {
        console.error("Failed to send order email:", err.message);
        return false;
    }
};

module.exports = sendOrderNotification;
