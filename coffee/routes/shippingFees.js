const express = require("express")
const router = express.Router()
const asyncHandler = require("express-async-handler")
const ShippingFee = require("../model/ShippingFee")

// ✅ CREATE
router.post("/", asyncHandler(async (req, res) => {
  const { destination, pickupStation, distance, amount, deliveryTime, codAvailable } = req.body

  const newFee = await ShippingFee.create({
    destination,
    pickupStation,
    distance,
    amount,
    deliveryTime,
    codAvailable: codAvailable || false
  })

  res.json({ success: true, data: newFee })
}))

// ✅ READ ALL
router.get("/", asyncHandler(async (req, res) => {
  const fees = await ShippingFee.find()
  res.json({ success: true, data: fees })
}))

// ✅ UPDATE
router.put("/:id", asyncHandler(async (req, res) => {
  const updated = await ShippingFee.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  )
  res.json({ success: true, data: updated })
}))

// ✅ DELETE
router.delete("/:id", asyncHandler(async (req, res) => {
  await ShippingFee.findByIdAndDelete(req.params.id)
  res.json({ success: true })
}))

// ✅ TOGGLE COD AVAILABILITY
router.patch("/:id/toggle-cod", asyncHandler(async (req, res) => {
  const fee = await ShippingFee.findById(req.params.id)
  if (!fee) {
    return res.status(404).json({ success: false, message: "Shipping fee not found" })
  }

  fee.codAvailable = !fee.codAvailable
  await fee.save()

  res.json({ 
    success: true, 
    data: fee,
    message: `COD ${fee.codAvailable ? 'enabled' : 'disabled'} for ${fee.destination}`
  })
}))

module.exports = router