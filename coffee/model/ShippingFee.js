const mongoose = require("mongoose")

const shippingFeeSchema = new mongoose.Schema({
  destination: {
    type: String,
    required: true,
    trim: true
  },
  pickupStation: {
    type: String,
    required: true,
    trim: true
  },
  distance: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  deliveryTime: {
    type: String,
    default: "Same Day Delivery",
    trim: true
  },
  codAvailable: {
    type: Boolean,
    default: false
  },
}, {
  timestamps: true
})

const ShippingFee = coffeeModel("ShippingFee", shippingFeeSchema)

module.exports = ShippingFee