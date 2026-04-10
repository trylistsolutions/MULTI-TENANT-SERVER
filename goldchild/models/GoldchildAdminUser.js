const mongoose = require('mongoose');

const goldchildAdminUserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    fullName: {
      type: String,
      required: true,
      trim: true
    },
    passwordHash: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ['super_admin', 'admin'],
      default: 'admin'
    },
    isBlocked: {
      type: Boolean,
      default: false
    },
    lastLoginAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

const getGoldchildAdminUserModel = (connection) => {
  return connection.models.GoldchildAdminUser || connection.model('GoldchildAdminUser', goldchildAdminUserSchema);
};

module.exports = {
  getGoldchildAdminUserModel
};
