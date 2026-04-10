const express = require("express");
const router = express.Router();
const Group = require("../models/group");
const Student = require("../models/student");
const Tutor = require("../models/tutors");
const Timetable = require("../models/timetables"); // Import Timetable model

// Create a new group
router.post("/", async (req, res) => {
  try {
    const { tutorId, groupName, timeSlot, startTime, endTime, maxCapacity, courses, tutorName } = req.body;
    console.log(req.body);

    if (!tutorId || !groupName || !timeSlot || !startTime || !endTime) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required fields" 
      });
    }

    // Create the new group
    const newGroup = new Group({
      tutorId,
      tutorName,
      groupName,
      timeSlot,
      startTime,
      endTime,
      maxCapacity,
      courses: courses || [],
      students: []
    });

    const savedGroup = await newGroup.save();
    
    // Create a corresponding timetable for the new group
    try {
      const tutor = await Tutor.findById(tutorId);
      if (!tutor) {
        console.warn("Tutor not found when creating timetable, but group was created");
      }
      
      const tutorName = tutor ? `${tutor.firstName} ${tutor.lastName}` : "Unknown Tutor";
      
      const newTimetable = new Timetable({
        groupId: savedGroup._id,
        tutorName,
        lessons: [],
        exams: [],
        events: [],
        createdBy: tutorId
      });
      
      await newTimetable.save();
      console.log(`Timetable created for group: ${savedGroup.groupName}`);
      
    } catch (timetableError) {
      // Log the error but don't fail the group creation
      console.error("Error creating timetable for group:", timetableError);
      // Continue with the group creation response
    }
    
    res.status(201).json({
      success: true,
      message: "Group created successfully",
      data: savedGroup
    });
  } catch (error) {
    console.error("Error creating group:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
});

// Get all groups
router.get("/", async (req, res) => {
  try {
    const groups = await Group.find()
      .populate("tutorId", "_id firstName lastName email phone")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: groups
    });
  } catch (error) {
    console.error("Error fetching groups:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
});

// Get groups by tutor
router.get("/tutor/:tutorId", async (req, res) => {
  try {
    const { tutorId } = req.params;
    
    const groups = await Group.find({ tutorId })
      .populate("tutorId", "firstName lastName email phone")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: groups
    });
  } catch (error) {
    console.error("Error fetching tutor groups:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
});

// Update a group
router.put("/:groupId", async (req, res) => {
  try {
    const { groupId } = req.params;
    let updateData = req.body;

    console.log("updateData", updateData);

    // Fetch the existing group first
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found"
      });
    }

    // Prevent tutor change if group already has students
    if (
      updateData.tutorId &&
      updateData.tutorId.toString() !== group.tutorId.toString() &&
      group.students.length > 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Cannot transfer group to another tutor while students are assigned"
      });
    }

    // If tutorId is provided, fetch tutor and override tutorName
    if (updateData.tutorId) {
      const tutor = await Tutor.findById(updateData.tutorId);
      if (tutor) {
        updateData.tutorName = `${tutor.firstName} ${tutor.lastName}`;
      }
    }

    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate("tutorId", "firstName lastName email phone");

    res.status(200).json({
      success: true,
      message: "Group updated successfully",
      data: updatedGroup
    });
  } catch (error) {
    console.error("Error updating group:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// Delete a group and its associated timetable
router.delete("/:groupId", async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await Group.findById(groupId);
    
    if (!group) {
      return res.status(404).json({ 
        success: false, 
        message: "Group not found" 
      });
    }

    // Check if group has students assigned
    if (group.students && group.students.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Cannot delete group with students assigned. Please transfer or remove all students first." 
      });
    }

    // Delete the group
    await Group.findByIdAndDelete(groupId);

    // Delete the associated timetable
    try {
      const timetable = await Timetable.findOne({ groupId });
      if (timetable) {
        await Timetable.findByIdAndDelete(timetable._id);
        console.log(`Timetable deleted for group: ${group.groupName}`);
      } else {
        console.log(`No timetable found for group: ${group.groupName}`);
      }
    } catch (timetableError) {
      // Log the error but don't fail the group deletion
      console.error("Error deleting timetable for group:", timetableError);
      // Continue with the group deletion response
    }

    res.status(200).json({
      success: true,
      message: "Group and associated timetable deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting group:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
});

// Assign students to a group
router.post("/:groupId/assign", async (req, res) => {
  
  try {
    const { groupId } = req.params;
    const { studentIds } = req.body;

    if (!studentIds || studentIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "No students provided" 
      });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ 
        success: false, 
        message: "Group not found" 
      });
    }

    // Check capacity
    const availableSlots = group.maxCapacity - group.currentCapacity;
    if (studentIds.length > availableSlots) {
      return res.status(400).json({ 
        success: false, 
        message: `Only ${availableSlots} available slots in this group` 
      });
    }

    // Get student details
    const students = await Student.find({ _id: { $in: studentIds } });
    
    // Prepare student data for group
    const studentsToAdd = students.map(student => ({
      _id: student._id,
      firstName: student.firstName,
      lastName: student.lastName,
      courseName: student.courseName,
      admissionNumber: student.admissionNumber,
      email: student.email
    }));

    // Update group
    group.students = [...group.students, ...studentsToAdd];
    group.currentCapacity += studentIds.length;
    
    // Update students with groupId
    await Student.updateMany(
      { _id: { $in: studentIds } },
      { 
        $set: { 
          allotment: "assigned", 
          tutorId: group.tutorId,
          tutorName: group.tutorName,
          groupId: groupId,
        } 
      }
    );

    const updatedGroup = await group.save();

    res.status(200).json({
      success: true,
      message: "Students assigned to group successfully",
      data: updatedGroup
    });
  } catch (error) {
    console.error("Error assigning students to group:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
});

// Transfer student to another group
router.post('/:groupId/transfer', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { studentId } = req.body;

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: 'Student ID is required'
      });
    }

    const targetGroup = await Group.findById(groupId);
    if (!targetGroup) {
      return res.status(404).json({
        success: false,
        message: 'Target group not found'
      });
    }

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const currentGroup = await Group.findOne({ 'students._id': studentId });

    if (currentGroup) {
      if (currentGroup._id.toString() === groupId) {
        return res.status(400).json({
          success: false,
          message: 'Student is already in this group'
        });
      }

      currentGroup.students = currentGroup.students.filter(
        s => s._id.toString() !== studentId
      );
      currentGroup.currentCapacity = currentGroup.students.length;
      await currentGroup.save();
    }

    if (targetGroup.students.length >= targetGroup.maxCapacity) {
      return res.status(400).json({
        success: false,
        message: 'Target group has reached maximum capacity'
      });
    }

    // Add student to target group
    targetGroup.students.push({
      _id: student._id,
      firstName: student.firstName,
      lastName: student.lastName,
      courseName: student.courseName,
      admissionNumber: student.admissionNumber,
      email: student.email
    });
    targetGroup.currentCapacity = targetGroup.students.length;
    await targetGroup.save();

    // Update student record
    await Student.findByIdAndUpdate(studentId, {
      $set: {
        groupId: targetGroup._id,
        tutorId: targetGroup.tutorId,
        tutorName: targetGroup.tutorName,
        allotment: "assigned"
      }
    });

    res.json({
      success: true,
      message: 'Student transferred successfully',
      data: targetGroup
    });
  } catch (error) {
    console.error('Error transferring student:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Remove student from group
router.post("/:groupId/remove-student/:studentId", async (req, res) => {
  try {
    const { groupId, studentId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found"
      });
    }

    group.students = group.students.filter(student => student._id.toString() !== studentId);
    group.currentCapacity = group.students.length;

    await Student.findByIdAndUpdate(studentId, {
      $set: {
        allotment: "pending",
        tutorId: null,
        tutorName: null,
        groupId: null
      }
    });

    const updatedGroup = await group.save();

    res.status(200).json({
      success: true,
      message: "Student removed from group successfully",
      data: updatedGroup
    });
  } catch (error) {
    console.error("Error removing student from group:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

module.exports = router;