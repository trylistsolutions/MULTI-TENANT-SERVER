// utils/admissionGenerator.js
const User = require('../models/User');

// Alternative utility function without Counter collection
const generateAdmissionNumber = async () => {
  try {
    const now = new Date();
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const currentMonth = monthNames[now.getMonth()];
    const currentYear = now.getFullYear();
    const prefix = `${currentMonth}-${currentYear}-`;
    
    // Find the highest admission number with current month-year prefix
    const highestUser = await User.findOne(
      { admissionNumber: new RegExp(`^${prefix}`) },
      { admissionNumber: 1 }
    ).sort({ admissionNumber: -1 });
    
    let sequenceNumber = 1;
    if (highestUser && highestUser.admissionNumber) {
      const lastNumber = highestUser.admissionNumber.split('-')[2];
      sequenceNumber = parseInt(lastNumber) + 1;
    }
    
    // Format the sequence number to 3 digits with leading zeros
    const formattedNumber = sequenceNumber.toString().padStart(3, '0');
    
    return `${prefix}${formattedNumber}`;
  } catch (error) {
    throw new Error(`Error generating admission number: ${error.message}`);
  }
};

module.exports = { generateAdmissionNumber };