// models/admin.js
const mongoose = require('mongoose');
const { getArobiscaSmsDB } = require('../config/db');

const arobiscaSmsConnection = getArobiscaSmsDB();
const arobiscaSmsModel = (name, schema, collection) => {
  if (!schema) {
    return arobiscaSmsConnection.model(name);
  }

  return arobiscaSmsConnection.models[name] || arobiscaSmsConnection.model(name, schema, collection);
};

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, required: true, },
  profileImage: { type: String, default: null },
  profilePicPublicId: { type: String, default: null },
  isBlockedAccess: { type: Boolean, default: false },
  token: { type: String, default: null }
}, {
  timestamps: true
});

// Clear any existing indexes (if any)
// arobiscaSmsModel('Admin', adminSchema).collection.dropIndexes();

const Admin = arobiscaSmsModel('Admin', adminSchema);
module.exports = Admin;
