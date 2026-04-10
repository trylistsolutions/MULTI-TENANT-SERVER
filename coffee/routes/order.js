const express = require('express');
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const router = express.Router();
const Order = require('../model/order');
const User = require('../model/user');
const ShippingFee = require('../model/ShippingFee');
const { sendEmail, generateOrderConfirmationEmail, generateStatusUpdateEmail, generateAdminOrderNotificationEmail } = require('../utils/emailService');

// Helper function to generate random password
const generateRandomPassword = (length = 12) => {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
};

// Helper function to create username from email
const createUsernameFromEmail = (email) => {
    return email.split('@')[0];
};

// Helper function to find or create user
const findOrCreateUser = async (email, phone, firstName, lastName, shippingAddress, accountType = 'personal', businessInfo = null) => {
    let user = await User.findOne({ email });

    if (!user) {
        // Create brand new user with account type
        const username = createUsernameFromEmail(email);
        const password = generateRandomPassword();
        const hashedPassword = await bcrypt.hash(password, 12);

        const userData = {
            username,
            email,
            phoneNumber: phone,
            password: hashedPassword,
            firstName: firstName || username,
            lastName: lastName || 'Customer',
            accountType: accountType || 'personal',
            isEmailVerified: true,
            shippingAddresses: [
                {
                    firstName: shippingAddress.firstName,
                    lastName: shippingAddress.lastName,
                    address: shippingAddress.address,
                    apartment: shippingAddress.apartment || '',
                    city: shippingAddress.city,
                    postalCode: shippingAddress.postalCode,
                },
            ],
        };

        // Add business fields if it's a business account
        if (accountType === 'business' && businessInfo) {
            userData.companyName = businessInfo.companyName;
            userData.address = businessInfo.businessAddress;
            userData.kraPin = businessInfo.kraPin;
        }

        user = new User(userData);
        await user.save();
        console.log(`New ${accountType} user created: ${username} with auto-generated password`);

        return { user, generatedPassword: password };
    }

    // ✅ User already exists → check if this address exists
    const exists = user.shippingAddresses.some(
        (addr) =>
            addr.address === shippingAddress.address &&
            addr.city === shippingAddress.city &&
            addr.postalCode === shippingAddress.postalCode
    );

    if (!exists && user.shippingAddresses.length < 3) {
        user.shippingAddresses.push({
            firstName: shippingAddress.firstName,
            lastName: shippingAddress.lastName,
            address: shippingAddress.address,
            apartment: shippingAddress.apartment || '',
            city: shippingAddress.city,
            postalCode: shippingAddress.postalCode,
        });
        await user.save();
        console.log(`Added new shipping address for existing user: ${user.email}`);
    }

    return { user, generatedPassword: null };
};

// Create a new order
router.post('/', asyncHandler(async (req, res) => {
    try {
        const {
            user, // This can be user ID (if logged in) or null (if guest)
            items,
            shippingAddress,
            billingAddress,
            shippingMethod, // This is the shipping method ID
            paymentMethod,
            deliveryNote,
            transactionData,
            coupon,
            subtotal,
            discount,
            shipping,
            total,
            vatTotal, // New: VAT total
            accountType, // New: account type for guest users
            businessInfo, // New: business info for guest business users
            creditTerms // New: credit terms for business credit purchases
        } = req.body;

        console.log(`Order received with payment method: ${paymentMethod}`);
        console.log(`Account type: ${accountType}`);
        if (creditTerms) {
            console.log(`Credit terms:`, creditTerms);
        }

        // Validate required fields
        if (!items || !shippingAddress || !paymentMethod || !total || !shippingMethod) {
            return res.status(400).json({ success: false, message: "Missing required fields." });
        }

        // Validate credit terms if credit payment is selected
        if (paymentMethod === 'credit') {
            if (!creditTerms || !creditTerms.creditDays || !creditTerms.paymentMethod) {
                return res.status(400).json({ success: false, message: "Credit terms are required for credit purchases." });
            }
        }

        // Get shipping method details to extract deliveryTime
        const shippingMethodDetails = await ShippingFee.findById(shippingMethod);
        if (!shippingMethodDetails) {
            return res.status(400).json({ success: false, message: "Invalid shipping method." });
        }

        let userObject;
        let generatedPassword = null;

        if (user) {
            // User is logged in, find existing user
            userObject = await User.findById(user);
            if (!userObject) {
                return res.status(400).json({ success: false, message: "User not found." });
            }
            // Add shipping address for logged-in users if it's new
            const exists = userObject.shippingAddresses.some(addr =>
                addr.address === shippingAddress.address &&
                addr.city === shippingAddress.city &&
                addr.postalCode === shippingAddress.postalCode
            );

            if (!exists) {
                if (userObject.shippingAddresses.length < 3) {
                    userObject.shippingAddresses.push({
                        firstName: shippingAddress.firstName,
                        lastName: shippingAddress.lastName,
                        address: shippingAddress.address,
                        apartment: shippingAddress.apartment || '',
                        city: shippingAddress.city,
                        postalCode: shippingAddress.postalCode,
                    });
                    await userObject.save();
                    console.log(`Added new shipping address for logged-in user: ${userObject.email}`);
                }
            }
        } else {
            // Guest checkout - find or create user with account type
            const { user: foundUser, generatedPassword: newPassword } = await findOrCreateUser(
                shippingAddress.email,
                shippingAddress.phone,
                shippingAddress.firstName,
                shippingAddress.lastName,
                shippingAddress, // pass full shipping address here
                accountType, // pass account type
                businessInfo // pass business info
            );

            userObject = foundUser;
            generatedPassword = newPassword;
        }

        const orderData = {
            user: userObject._id,
            items: items.map(item => ({
                product: item._id,
                name: item.name,
                image: item.images?.[0]?.url || '/placeholder.jpg',
                price: item.price,
                offerPrice: item.offerPrice,
                quantity: item.quantity
            })),
            shippingAddress,
            billingAddress: billingAddress || shippingAddress,
            shippingMethod: shippingMethodDetails.destination, // Store the destination name
            deliveryTime: shippingMethodDetails.deliveryTime, // Store the delivery time string
            paymentMethod,
            deliveryNote,
            subtotal,
            vatTotal,
            discount: discount || 0,
            shipping,
            total,
            coupon: coupon || null,
            paymentStatus: paymentMethod === 'cod' ? 'pending' : 'paid'
        };

        // Add M-Pesa transaction data if available
        if (paymentMethod === 'mpesa' && transactionData) {
            orderData.mpesaTransaction = transactionData;
            orderData.paymentStatus = 'paid';
        }

        // Add credit terms if credit payment is selected
        if (paymentMethod === 'credit') {
            orderData.creditTerms = creditTerms;
            orderData.paymentStatus = 'pending'; // Credit payments are pending until paid
        }

        console.log(`Mpesa Transactional Data`, transactionData);

        const order = new Order(orderData);
        const savedOrder = await order.save();

        // Populate for email
        const populatedOrder = await Order.findById(savedOrder._id)
            .populate('user', 'username email firstName lastName accountType companyName')
            .populate('items.product', 'name');

        // Send confirmation email with account type info
        const emailHtml = generateOrderConfirmationEmail(
            populatedOrder.toObject(),
            userObject,
            generatedPassword,
            accountType || userObject.accountType // Pass account type for email template
        );
        await sendEmail(
            userObject.email,
            `Order Confirmation - ${populatedOrder.orderNumber}`,
            emailHtml
        );


        // ADD THIS: Send email to admin
        const adminEmailHtml = generateAdminOrderNotificationEmail(
            populatedOrder.toObject(),
            userObject
        );
        await sendEmail(
            'coffeearobisca@gmail.com', // Admin email
            `NEW ORDER: ${populatedOrder.orderNumber} - KES ${populatedOrder.total.toLocaleString()}`,
            adminEmailHtml
        );


        res.json({
            success: true,
            message: "Order created successfully.",
            data: populatedOrder,
            userCreated: !!generatedPassword
        });

    } catch (error) {
        console.error('Order creation error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Get orders by status
router.get('/', asyncHandler(async (req, res) => {
    try {
        const { status, paymentMethod, page = 1, limit = 100 } = req.query;

        const filter = {};
        if (status && status !== 'all') {
            filter.orderStatus = status;
        }
        if (paymentMethod && paymentMethod !== 'all') {
            filter.paymentMethod = paymentMethod;
        }

        const orders = await Order.find(filter)
            .populate('user', 'name email phoneNumber accountType companyName')
            .populate('items.product', 'name images')
            .sort({ orderDate: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Order.countDocuments(filter);

        res.json({
            success: true,
            message: "Orders retrieved successfully.",
            data: orders,
            total
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Update order status (with admin notes and improved wording)
router.put('/:id/status', asyncHandler(async (req, res) => {
    try {
        const orderId = req.params.id;
        const { orderStatus, adminNotes } = req.body;

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ success: false, message: "Invalid order ID." });
        }

        if (!orderStatus) {
            return res.status(400).json({ success: false, message: "Order status is required." });
        }

        const order = await Order.findById(orderId).populate('user', 'email firstName lastName');
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }

        const oldStatus = order.orderStatus;

        const updateData = { orderStatus };

        // 🟤 Clear or set admin notes
        updateData.adminNotes = adminNotes?.trim() ? adminNotes : "";

        // 🟤 Mark COD orders as paid upon delivery
        if (orderStatus === 'delivered' && order.paymentMethod === 'cod') {
            updateData.paymentStatus = 'paid';
        }

        const updatedOrder = await Order.findByIdAndUpdate(orderId, updateData, { new: true })
            .populate('user', 'email firstName lastName')
            .populate('items.product', 'name');

        // 🟤 Send email only if status actually changed
        if (oldStatus !== orderStatus) {
            const emailHtml = generateStatusUpdateEmail(
                updatedOrder.toObject(),
                oldStatus,
                orderStatus,
                adminNotes?.trim() ? adminNotes : null // ⬅ ensures blank note is not included
            );
            await sendEmail(
                order.user.email,
                `Order #${updatedOrder.orderNumber} — ${orderStatus.toUpperCase()} Update`,
                emailHtml
            );
        }

        res.json({
            success: true,
            message: `Order status updated to "${orderStatus}" successfully.`,
            data: updatedOrder
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Add this to your orders routes
router.put('/:id/payment-status', asyncHandler(async (req, res) => {
    try {
        const orderId = req.params.id;
        const { paymentStatus } = req.body;

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ success: false, message: "Invalid order ID." });
        }

        if (!paymentStatus) {
            return res.status(400).json({ success: false, message: "Payment status is required." });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }

        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            { paymentStatus },
            { new: true }
        )
            .populate('user', 'email firstName lastName phoneNumber')
            .populate('items.product', 'name images');

        res.json({
            success: true,
            message: `Payment status updated to "${paymentStatus}" successfully.`,
            data: updatedOrder
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Get orders by user ID
router.get('/user/:userId', asyncHandler(async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 50 } = req.query;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ success: false, message: "Invalid user ID." });
        }

        const orders = await Order.find({ user: userId })
            .populate('user', 'firstName lastName email phoneNumber')
            .populate('items.product', 'name images')
            .sort({ orderDate: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Order.countDocuments({ user: userId });

        res.json({
            success: true,
            message: "User orders retrieved successfully.",
            data: orders,
            total
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Delete an order
router.delete('/:id', asyncHandler(async (req, res) => {
    try {
        const orderId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ success: false, message: "Invalid order ID." });
        }

        const deletedOrder = await Order.findByIdAndDelete(orderId);
        if (!deletedOrder) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }

        // Remove order reference from user
        if (deletedOrder.user) {
            await User.findByIdAndUpdate(deletedOrder.user, {
                $pull: { orders: deletedOrder._id }
            });
        }

        res.json({ success: true, message: "Order deleted successfully." });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Get order statistics with more details
router.get('/stats/overview', asyncHandler(async (req, res) => {
    try {
        const totalOrders = await Order.countDocuments();
        const pendingOrders = await Order.countDocuments({ orderStatus: 'pending' });
        const confirmedOrders = await Order.countDocuments({ orderStatus: 'confirmed' });
        const processingOrders = await Order.countDocuments({ orderStatus: 'processing' });
        const shippedOrders = await Order.countDocuments({ orderStatus: 'shipped' });
        const deliveredOrders = await Order.countDocuments({ orderStatus: 'delivered' });
        const cancelledOrders = await Order.countDocuments({ orderStatus: 'cancelled' });

        const totalRevenue = await Order.aggregate([
            { $match: { paymentStatus: 'paid' } },
            { $group: { _id: null, total: { $sum: '$total' } } }
        ]);

        const mpesaOrders = await Order.countDocuments({ paymentMethod: 'mpesa' });
        const codOrders = await Order.countDocuments({ paymentMethod: 'cod' });

        const revenue = totalRevenue.length > 0 ? totalRevenue[0].total : 0;

        res.json({
            success: true,
            data: {
                totalOrders,
                pendingOrders,
                confirmedOrders,
                processingOrders,
                shippedOrders,
                deliveredOrders,
                cancelledOrders,
                completedOrders: deliveredOrders,
                totalRevenue: revenue,
                mpesaOrders,
                codOrders
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

module.exports = router;