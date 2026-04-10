// utils/sanitizeUser.js

// List of sensitive fields to exclude globally
const SENSITIVE_FIELDS = [
  'password',
  'packageHistory',
  'paymentHistory',
  'processedTransactions',
  'emailVerificationCode',
  'emailVerificationExpires',
  'loginEmailVerificationCode',
  'loginEmailVerificationExpires',
];

// Recursive function to remove sensitive keys from any object
function removeSensitiveFields(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(removeSensitiveFields);
  }

  const cleaned = {};
  for (const key in obj) {
    if (!SENSITIVE_FIELDS.includes(key)) {
      cleaned[key] = removeSensitiveFields(obj[key]);
    }
  }

  return cleaned;
}

// Main sanitizer
export const sanitizeUser = (userDoc) => {
  if (!userDoc) return null;

  // Convert Mongoose document to plain JS object
  const userObj = userDoc.toObject ? userDoc.toObject() : userDoc;

  // Remove all sensitive data recursively
  return removeSensitiveFields(userObj);
};
