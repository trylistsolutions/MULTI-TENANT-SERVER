const mongoose = require('mongoose');

const goldchildCourseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    duration: {
      type: Number,
      required: true,
      min: 1
    },
    durationType: {
      type: String,
      enum: ['hours', 'days', 'weeks', 'months'],
      required: true
    },
    courseFee: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active'
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

const getGoldchildCourseModel = (connection) => {
  return connection.models.GoldchildCourse || connection.model('GoldchildCourse', goldchildCourseSchema);
};

module.exports = {
  getGoldchildCourseModel
};
