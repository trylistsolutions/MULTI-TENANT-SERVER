const mongoose = require("mongoose");

const borrowedBy = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
  studentAdm: { type: String, required: true },
  dateBorrowed: { type: Date,},
  returnDate: { type: Date,},
  allowedDays: { type: Number },
});

const InventorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String },
    purchasePrice: { type: Number, required: true },
    feesCollected: { type: Number, default: 0 },
    estimatedCurrentPrice: { type: Number, required: true },
    datePurchased: { type: Date, required: true },
    quantity: { type: Number, required: true },
    status: { type: String, default: "Available",},
    borrowDate: {type: Date,},
    dueDate: {type: Date,},
    imageUrl: { type: String },
    imagePublicId: { type: String },
    borrowedBy: [borrowedBy],
  },
  { timestamps: true }
);

module.exports = arobiscaSmsModel("Inventory", InventorySchema);
