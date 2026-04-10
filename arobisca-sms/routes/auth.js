const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const Student = require("../models/student");
const Tutor = require("../models/tutors");
const Admin = require("../models/admin");
const router = express.Router();

// Function to determine collection based on role
const getUserModel = (role) => {
  switch (role) {
    case "student":
      return Student;
    case "tutor":
      return Tutor;
    case "admin":
      return Admin;
    default:
      return null;
  }
};

// ✅ Login Route
router.post("/login", asyncHandler(async (req, res) => {
  const { email, username, password, role, admissionNumber, rememberMe } = req.body;
  const Model = getUserModel(role);
  const jwtSecret = process.env.AROBISCA_SMS_JWT_SECRET || process.env.JWT_SECRET;

  if (!Model) {
    return res.status(400).json({ success: false, message: "Invalid role" });
  }

  try {
    let query = {};

    if (role === "student") {
      query = { admissionNumber };
    } else if (role === "tutor") {
      query = { email };
    } else if (role === "admin") {
      query = { username };
    } else {
      return res.status(400).json({ success: false, message: "Invalid role provided" });
    }

    const user = await Model.findOne(query);

    if (user && role === "admin") {
      if (user.isBlockedAccess) {
        return res.status(401).json({ success: false, message: "You are Blocked from accessing the System, Please Contact Admin" });
      }
    }

    if (!user) {
      if (role === "student") {
        return res.status(401).json({ success: false, message: "This Admission Number does not exist in our records" });
      } else if (role === "admin") {
        return res.status(401).json({ success: false, message: "This Username does not exist in our records" });
      } else {
        return res.status(401).json({ success: false, message: "This Email is not registered in the Database" });
      }
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials. Check your Password" });
    }

    var token = '';
    var tokenDuration = '';

    // Generate token
    if (rememberMe) {
      tokenDuration = 14;
      token = jwt.sign({ id: user._id, role }, jwtSecret, { expiresIn: "14d" });
    } else {
      tokenDuration = 2;
      token = jwt.sign({ id: user._id, role }, jwtSecret, { expiresIn: "2d" });
    }

    user.token = token;
    await user.save();

    const loginDate = new Date();
    const loginTimestamp = Date.now();

    if (role === "tutor") {
      res.json({
        success: true,
        message: "Login successful",
        token,
        data: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          cohort: user.currentCohort,
          role,
          loginDate: loginDate.toISOString(),
          tokenDuration,
          loginTimestamp,
        },
      });
    } else if (role === "admin") {
      res.json({
        success: true,
        message: "Login successful",
        token,
        data: {
          id: user._id,
          role: user.role,
          profileImage: user.profileImage,
          isBlockedAccess: user.currentCohort,
          username: user.username,
          loginDate: loginDate.toISOString(),
          tokenDuration,
          loginTimestamp,
        },
      });
    } else if (role === "student") {
      // Find which groups the student belongs to
      const Group = require("../models/group"); // Import the Group model
      const groups = await Group.find({
        "students._id": user._id
      }).select('_id groupName timeSlot startTime endTime tutorId');

      // Get the first group (students typically belong to only one group)
      const firstGroup = groups.length > 0 ? groups[0] : null;

      // Extract group information as an object (not array)
      const groupInfo = firstGroup ? {
        groupId: firstGroup._id,
        groupName: firstGroup.groupName,
        timeSlot: firstGroup.timeSlot,
        startTime: firstGroup.startTime,
        endTime: firstGroup.endTime,
        tutorId: firstGroup.tutorId
      } : null;

      res.json({
        success: true,
        message: "Login successful",
        token,
        data: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          cohort: user.currentCohort,
          tutorId: user.tutorId,
          admissionNumber: user.admissionNumber,
          cohort: user.startDate,
          role,
          loginDate: loginDate.toISOString(),
          tokenDuration,
          loginTimestamp,
          group: groupInfo, // Changed from groups (array) to group (object)
        },
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));

// ✅ Forgot Password Route (Request Code)
router.post("/forgot-password", asyncHandler(async (req, res) => {
  const { email, role } = req.body;
  const Model = getUserModel(role);

  if (!Model) {
    return res.status(400).json({ success: false, message: "Invalid role" });
  }

  try {
    const user = await Model.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Generate 6-digit code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Save the reset code temporarily (For production, use Redis or a database field)
    user.resetCode = resetCode;
    await user.save();

    // Send email (TODO: Implement email service)
    console.log(`Reset code for ${email}: ${resetCode}`);

    res.json({ success: true, message: "Verification code sent to your email" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));

// ✅ Verify Reset Code Route
router.post("/verify-code", asyncHandler(async (req, res) => {
  const { email, code, role } = req.body;
  const Model = getUserModel(role);

  if (!Model) {
    return res.status(400).json({ success: false, message: "Invalid role" });
  }

  try {
    const user = await Model.findOne({ email });

    if (!user || user.resetCode !== code) {
      return res.status(400).json({ success: false, message: "Invalid or expired code" });
    }

    res.json({ success: true, message: "Code verified successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));

// ✅ Reset Password Route
router.post("/reset-password", asyncHandler(async (req, res) => {
  const { email, password, role } = req.body;
  const Model = getUserModel(role);

  if (!Model) {
    return res.status(400).json({ success: false, message: "Invalid role" });
  }

  try {
    const user = await Model.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    user.resetCode = null; // Clear reset code
    await user.save();

    res.json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));

module.exports = router;
