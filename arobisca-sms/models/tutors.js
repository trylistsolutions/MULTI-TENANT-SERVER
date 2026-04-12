const mongoose = require("mongoose");
const { getArobiscaSmsDB } = require('../config/db');

const arobiscaSmsConnection = getArobiscaSmsDB();
const arobiscaSmsModel = (name, schema, collection) => {
  if (!schema) {
    return arobiscaSmsConnection.model(name);
  }
  return arobiscaSmsConnection.models[name] || arobiscaSmsConnection.model(name, schema, collection);
};

const tutorSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  role: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  kra: { type: String, required: true },
  password: { type: String },
  salary: { type: Number, required: true },
  studentCount: { type: Number, default: 0 },
  status: { type: String },
  profilePicture: { type: String },
  profilePicPublicId: { type: String, required: false },
  currentCohort: { type: Date, required: false },
  groups: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Group"
  }],
  salaryPayments: [
    {
      month: { type: String, required: true },
      year: { type: Number, required: true },
      status: { type: String, enum: ["pending", "paid"], default: "pending" },
      paidAt: { type: Date },
      amount: { type: Number },
      processedBy: { type: String } // Admin/staff who marked it as paid
    }
  ],
  bonuses: [
    {
      title: { type: String, required: true },
      amount: { type: Number, required: true },
      description: { type: String },
      dateGiven: { type: Date, default: Date.now },
      processedBy: { type: String },
      status: { type: String, enum: ["pending", "paid"], default: "paid" },
      paidAt: { type: Date, default: Date.now }
    }
  ]
}, { timestamps: true });

module.exports = arobiscaSmsModel('Tutor', tutorSchema);
