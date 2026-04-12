// models/finance.js
const mongoose = require("mongoose");
const { getArobiscaSmsDB } = require('../config/db');

const arobiscaSmsConnection = getArobiscaSmsDB();
const arobiscaSmsModel = (name, schema, collection) => {
  if (!schema) {
    return arobiscaSmsConnection.model(name);
  }
  return arobiscaSmsConnection.models[name] || arobiscaSmsConnection.model(name, schema, collection);
};

// Base schemas without any indexes
const invoiceSchema = new mongoose.Schema({
  dateOfIssue: { type: Date, required: true },
  invoiceNumber: { type: String, required: true },
  studentName: { type: String, required: true },
  studentAdmnNumber: { type: String, required: true },
  courseEnrolled: { type: String, required: true },
  totalAmountDue: { type: Number, required: true },
  paymentDueDate: { type: Date, required: true },
  paymentStatus: { type: String, enum: ["Paid", "Pending"], default: "Pending" }
}, { _id: true }); // Explicitly enable _id

const receiptSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  receiptNumber: { type: String, required: true },
  name: { type: String, required: true },
  courseEnrolled: { type: String, required: false },
  admnNumber: { type: String, required: true },
  nationalIdNumber: { type: String, required: true },
  totalAmountDue: { type: Number, required: true },
  totalAmountRemaining: { type: Number, required: false }
}, { _id: true }); // Explicitly enable _id

const billSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  billNumber: { type: String, required: true },
  vendor: { type: String, required: true },
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  dueDate: { type: Date, required: true },
  status: { type: String, default: "Pending" }
}, { _id: true }); // Explicitly enable _id

// Main schema
const financialRecordsSchema = new mongoose.Schema({
  month: { type: String, required: true },
  invoices: [invoiceSchema],
  receipts: [receiptSchema],
  bills: [billSchema]
}, { 
  timestamps: true,
  strict: true // Ensure no additional fields are saved
});

// Clear any existing indexes (if any)
// arobiscaSmsModel('FinancialRecords', financialRecordsSchema).collection.dropIndexes();

const FinancialRecords = arobiscaSmsModel("FinancialRecords", financialRecordsSchema);
module.exports = FinancialRecords;