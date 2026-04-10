// models/YearlyApplicationCounter.js
const mongoose = require('mongoose');
const { getArobiscaSmsDB } = require('../config/db');

const arobiscaSmsConnection = getArobiscaSmsDB();
const arobiscaSmsModel = (name, schema, collection) => {
  if (!schema) {
    return arobiscaSmsConnection.model(name);
  }

  return arobiscaSmsConnection.models[name] || arobiscaSmsConnection.model(name, schema, collection);
};

const yearlyApplicationCounterSchema = new mongoose.Schema({
    year: {
        type: Number,
        required: true,
        unique: true  // One counter per year
    },
    totalApplications: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Get next application number for current year
yearlyApplicationCounterSchema.statics.getNextApplicationNumber = async function() {
    const year = new Date().getFullYear();
    
    // Use findOneAndUpdate for atomic increment
    const counter = await this.findOneAndUpdate(
        { year },
        { 
            $inc: { totalApplications: 1 },
            $set: { updatedAt: new Date() }
        },
        { 
            new: true,
            upsert: true,  // Create if doesn't exist
            runValidators: true 
        }
    );
    
    // Return formatted application number
    return `APP-${year}-${counter.totalApplications.toString().padStart(3, '0')}`;
};

// Get statistics for a year
yearlyApplicationCounterSchema.statics.getYearStats = async function(year) {
    const counter = await this.findOne({ year });
    return {
        year,
        totalApplications: counter ? counter.totalApplications : 0,
        lastUpdated: counter ? counter.updatedAt : null
    };
};

const YearlyApplicationCounter = arobiscaSmsModel('YearlyApplicationCounter', yearlyApplicationCounterSchema);
module.exports = YearlyApplicationCounter;