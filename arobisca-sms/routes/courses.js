const express = require('express');
const asyncHandler = require('express-async-handler');
const Course = require('../models/courses');

const router = express.Router();

// ✅ Get all courses
router.get('/', asyncHandler(async (req, res) => {
    const courses = await Course.find({});
    res.status(200).json(courses);
}));

// ✅ Get a single course by ID
router.get('/:id', asyncHandler(async (req, res) => {
    const course = await Course.findById(req.params.id);
    if (!course) {
        return res.status(404).json({ error: "Course not found" });
    }
    res.status(200).json(course);
}));

// ✅ Create a new course
router.post('/', asyncHandler(async (req, res) => {
    const { name, description, duration, fee, cardColor, examScheme } = req.body;

    // Check for missing fields
    if (!name || !description || !duration || !fee || !cardColor) {
        return res.status(400).json({ error: "All fields are required" });
    }

    // Ensure examScheme is valid (optional validation)
    if (!Array.isArray(examScheme) || examScheme.some(exam => !exam.name || !exam.weight)) {
        return res.status(400).json({ error: "Invalid exam scheme format" });
    }

    // Check if course already exists
    const existingCourse = await Course.findOne({ name });
    if (existingCourse) {
        return res.status(400).json({ error: "Course with this name already exists" });
    }

    // Create and save the new course
    const newCourse = await Course.create({ name, description, duration, fee, cardColor, examScheme });
    res.status(201).json({ message: "Course created successfully", course: newCourse });
}));


// ✅ Update a course
router.put('/:id', asyncHandler(async (req, res) => {
    const { name, description, duration, fee, cardColor, examScheme } = req.body;

    // Validate examScheme format (optional)
    if (examScheme && (!Array.isArray(examScheme) || examScheme.some(exam => !exam.name || !exam.weight))) {
        return res.status(400).json({ error: "Invalid exam scheme format" });
    }

    const updatedCourse = await Course.findByIdAndUpdate(
        req.params.id,
        { name, description, duration, fee, cardColor, examScheme },
        { new: true, runValidators: true }
    );

    if (!updatedCourse) {
        return res.status(404).json({ error: "Course not found" });
    }

    res.status(200).json({ message: "Course updated successfully", course: updatedCourse });
}));


// ✅ Delete a course
router.delete('/:id', asyncHandler(async (req, res) => {
    const deletedCourse = await Course.findByIdAndDelete(req.params.id);
    if (!deletedCourse) {
        return res.status(404).json({ error: "Course not found" });
    }

    res.status(200).json({ message: "Course deleted successfully" });
}));

module.exports = router;
