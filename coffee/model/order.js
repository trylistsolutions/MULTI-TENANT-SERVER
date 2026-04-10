const mongoose = require('mongoose');
const { getCoffeeDB } = require('../config/db');

const coffeeConnection = getCoffeeDB();
const coffeeModel = (name, schema, collection) => {
  if (!schema) {
    return coffeeConnection.model(name);
  }

  return coffeeConnection.models[name] || coffeeConnection.model(name, schema, collection);
};

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  image: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  offerPrice: {
    type: Number
  }
});


const creditTermsSchema = new mongoose.Schema({
  creditDays: {
    type: Number,
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['cheque', 'bank_transfer', 'mpesa', 'cash'],
    required: true
  }
});

const addressSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: false
  },
  phone: {
    type: String,
    required: false
  },
  address: {
    type: String,
    required: true
  },
  apartment: {
    type: String
  },
  city: {
    type: String,
    required: true
  },
  postalCode: {
    type: String
  }
});

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true
  },
  discountType: {
    type: String,
    enum: ['fixed', 'percentage'],
    required: true
  },
  discountAmount: {
    type: Number,
    required: true
  },
  appliedDiscount: {
    type: Number,
    required: true
  }
});

const mpesaTransactionSchema = new mongoose.Schema({
  phone: String,
  amount: Number,
  transactionId: String,
});

const orderSchema = new mongoose.Schema({
  // User information
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Order details
  orderNumber: {
    type: String,
    unique: true
    // Remove required: true since we generate it automatically
  },
  orderDate: {
    type: Date,
    default: Date.now
  },
  orderStatus: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },

  // Products
  items: [orderItemSchema],

  // Pricing
  subtotal: {
    type: Number,
    required: true
  },
  discount: {
    type: Number,
    default: 0
  },
  shipping: {
    type: Number,
    required: true
  },
  total: {
    type: Number,
    required: true
  },
  vatTotal: {
    type: Number,
    required: false
  },

  // Coupon information
  coupon: couponSchema,

  // Addresses
  shippingAddress: addressSchema,
  billingAddress: addressSchema,

  // Shipping information
  shippingMethod: {
    type: String,
    required: true
  },
  deliveryTime: {
    type: String,
    required: true
  },
  deliveryNote: String,

  // Payment information
  paymentMethod: {
    type: String,
    enum: ['mpesa', 'cod'],
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },

  // Payment information
  paymentMethod: {
    type: String,
    enum: ['mpesa', 'cod', 'credit'], // Add 'credit' to enum
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },

  // Credit terms for business purchases
  creditTerms: creditTermsSchema,

  // M-Pesa transaction details (for paid orders)
  mpesaTransaction: mpesaTransactionSchema,

  // Admin notes
  adminNotes: String
}, {
  timestamps: true
});

// Generate order number before saving - FIXED VERSION
orderSchema.pre('save', async function (next) {
  // Only generate order number if it doesn't exist
  if (!this.orderNumber) {
    try {
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');

      // Find the latest order for today
      const startOfDay = new Date(date.setHours(0, 0, 0, 0));
      const endOfDay = new Date(date.setHours(23, 59, 59, 999));

      const lastOrder = await this.constructor.findOne({
        orderDate: { $gte: startOfDay, $lte: endOfDay }
      }).sort({ orderNumber: -1 });

      let sequence = 1;
      if (lastOrder && lastOrder.orderNumber) {
        const lastSequence = parseInt(lastOrder.orderNumber.slice(-4));
        sequence = lastSequence + 1;
      }

      this.orderNumber = `ORD-${year}${month}${day}-${String(sequence).padStart(4, '0')}`;
      console.log('Generated order number:', this.orderNumber);
    } catch (error) {
      console.error('Error generating order number:', error);
      // Fallback order number
      this.orderNumber = `ORD-${Date.now()}`;
    }
  }
  next();
});

// Update user's orders when order is saved
orderSchema.post('save', async function (doc) {
  try {
    const User = coffeeModel('User');
    await User.findByIdAndUpdate(doc.user, {
      $addToSet: { orders: doc._id }
    });
    console.log('Updated user orders reference for user:', doc.user);
  } catch (error) {
    console.error('Error updating user orders:', error);
  }
});

const Order = coffeeModel('Order', orderSchema);

module.exports = Order;