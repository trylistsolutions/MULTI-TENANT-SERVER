const express = require("express");
const router = express.Router();
const Timetable = require("../models/timetables");
const Student = require("../models/student");
const Tutor = require("../models/tutors");

// 📌 Get ALL Timetables with populated group details
router.get("/", async (req, res) => {
    try {
        const timetables = await Timetable.find()
            .populate('groupId', 'groupName timeSlot tutorId')
            .populate('groupId.tutorId', 'firstName lastName')
            .populate('lessons.tutorId', 'firstName lastName')
            .populate('exams.invigilatorId', 'firstName lastName')
            .populate('events.organizerId', 'firstName lastName')
            .sort({ createdAt: -1 }); // Sort by most recent

        res.json({
            success: true,
            message: "Timetables retrieved successfully.",
            data: timetables
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**  📌 CREATE A NEW LESSON (GROUP-BASED) */
router.post("/create-lesson", async (req, res) => {
    try {
        const { date, startTime, endTime, venue, topic, groupId, tutorId } = req.body;

        // Validate required fields
        if (!date || !startTime || !endTime || !venue || !topic || !tutorId || !groupId) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }

        // Find or create timetable for the specified group
        let timetable = await Timetable.findOne({ groupId, createdBy: tutorId });
        let tutor = await Tutor.findOne({ _id: tutorId });
        const tutorName = `${tutor.firstName} ${tutor.lastName}`;

        if (!timetable) {
            timetable = new Timetable({
                groupId,
                tutorName,
                lessons: [],
                exams: [],
                events: [],
                createdBy: tutorId
            });
        }

        // Get all timetables to check for global conflicts
        const allTimetables = await Timetable.find({});

        // Helper function to check time overlap
        const isTimeOverlap = (start1, end1, start2, end2) => {
            return (
                (start1 >= start2 && start1 < end2) ||
                (end1 > start2 && end1 <= end2) ||
                (start1 <= start2 && end1 >= end2)
            );
        };

        // Check for conflicts across all timetables
        const hasConflict = allTimetables.some(tt => {
            // Check lessons
            const lessonConflict = tt.lessons.some(lesson =>
                lesson.date.toISOString().split("T")[0] === date &&
                lesson.venue === venue &&
                isTimeOverlap(startTime, endTime, lesson.startTime, lesson.endTime)
            );

            // Check exams
            const examConflict = tt.exams.some(exam =>
                exam.examDate.toISOString().split("T")[0] === date &&
                exam.venue === venue &&
                isTimeOverlap(startTime, endTime, exam.startTime, exam.endTime)
            );

            // Check events
            const eventConflict = tt.events.some(event =>
                event.eventDate.toISOString().split("T")[0] === date &&
                event.venue === venue &&
                isTimeOverlap(startTime, endTime, event.startTime, event.endTime)
            );

            return lessonConflict || examConflict || eventConflict;
        });

        if (hasConflict) {
            return res.status(400).json({
                success: false,
                message: "The venue is already booked for this time slot in another timetable"
            });
        }

        // No conflicts found, add the new lesson
        timetable.lessons.push({
            date,
            startTime,
            endTime,
            venue,
            topic,
            tutorId,
            attended: false
        });

        await timetable.save();

        res.status(201).json({
            success: true,
            message: "Lesson added successfully",
            data: timetable
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**  📌 UPDATE A LESSON (WITH GROUP TRANSFER SUPPORT) */
router.put("/update-lesson/:lessonId", async (req, res) => {
    try {
        const { lessonId } = req.params;
        const { date, startTime, endTime, venue, topic, groupId, tutorId, originalGroupId } = req.body;

        // Validate required fields
        if (!date || !startTime || !endTime || !venue || !topic || !tutorId || !groupId) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }

        // Check if group is being changed
        const isGroupChanged = originalGroupId && originalGroupId !== groupId;

        let sourceTimetable = null;
        let lesson = null;

        // If group is being changed, find the lesson in the original timetable first
        if (isGroupChanged) {
            sourceTimetable = await Timetable.findOne({
                groupId: originalGroupId,
                createdBy: tutorId
            });

            if (!sourceTimetable) {
                return res.status(404).json({
                    success: false,
                    message: "Source timetable not found"
                });
            }

            // Find the lesson in the source timetable
            lesson = sourceTimetable.lessons.id(lessonId);
            if (!lesson) {
                return res.status(404).json({
                    success: false,
                    message: "Lesson not found in source timetable"
                });
            }
        }

        // Find or create the target timetable
        let targetTimetable = await Timetable.findOne({
            groupId: groupId,
            createdBy: tutorId
        });

        if (!targetTimetable) {
            // Create new timetable if it doesn't exist
            const tutor = await Tutor.findById(tutorId);
            if (!tutor) {
                return res.status(404).json({
                    success: false,
                    message: "Tutor not found"
                });
            }

            const tutorName = `${tutor.firstName} ${tutor.lastName}`;

            targetTimetable = new Timetable({
                groupId,
                tutorName,
                lessons: [],
                exams: [],
                events: [],
                createdBy: tutorId
            });
        }

        // Get all timetables to check for global conflicts
        const allTimetables = await Timetable.find({});

        // Helper function to check time overlap
        const isTimeOverlap = (start1, end1, start2, end2) => {
            return (
                (start1 >= start2 && start1 < end2) ||
                (end1 > start2 && end1 <= end2) ||
                (start1 <= start2 && end1 >= end2)
            );
        };

        // Check for conflicts across all timetables (excluding the current lesson)
        const hasConflict = allTimetables.some(tt => {
            // Check if this is the target timetable where the lesson will be
            const isTargetTimetable = tt._id.toString() === targetTimetable._id.toString();
            
            // Check lessons (excluding the current lesson if it's in the target timetable)
            const lessonConflict = tt.lessons.some(l => {
                // Skip if this is the lesson being edited (same ID)
                if (l._id.toString() === lessonId) return false;
                
                // Check for conflict
                return l.date.toISOString().split("T")[0] === date &&
                       l.venue === venue &&
                       isTimeOverlap(startTime, endTime, l.startTime, l.endTime);
            });

            // Check exams (always check all exams)
            const examConflict = tt.exams.some(exam =>
                exam.examDate.toISOString().split("T")[0] === date &&
                exam.venue === venue &&
                isTimeOverlap(startTime, endTime, exam.startTime, exam.endTime)
            );

            // Check events (always check all events)
            const eventConflict = tt.events.some(event =>
                event.eventDate.toISOString().split("T")[0] === date &&
                event.venue === venue &&
                isTimeOverlap(startTime, endTime, event.startTime, event.endTime)
            );

            return lessonConflict || examConflict || eventConflict;
        });

        if (hasConflict) {
            return res.status(400).json({
                success: false,
                message: "The venue is already booked for this time slot in another timetable"
            });
        }

        // Handle group transfer
        if (isGroupChanged) {
            // Remove lesson from source timetable
            sourceTimetable.lessons = sourceTimetable.lessons.filter(
                l => l._id.toString() !== lessonId
            );
            await sourceTimetable.save();

            // Add lesson to target timetable with updated information
            targetTimetable.lessons.push({
                date,
                startTime,
                endTime,
                venue,
                topic,
                tutorId,
                attended: lesson.attended,
                isMarked: lesson.isMarked,
                attendedStudents: lesson.attendedStudents,
                absentStudents: lesson.absentStudents
            });
        } else {
            // Regular update - find lesson in target timetable
            lesson = targetTimetable.lessons.id(lessonId);
            if (!lesson) {
                return res.status(404).json({
                    success: false,
                    message: "Lesson not found in target timetable"
                });
            }

            // Store original date for comparison
            const originalDate = lesson.date;

            // Check if the lesson is being rescheduled to a future date
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const newDate = new Date(date);
            const oldDate = new Date(originalDate);

            // If new date is in the future (after today) and different from the original date
            if (newDate > today && newDate.getTime() !== oldDate.getTime()) {
                // Reset attendance tracking
                lesson.attended = false;
                lesson.isMarked = false;
                lesson.attendedStudents = [];
                lesson.absentStudents = [];
            }

            // Update the lesson
            lesson.date = date;
            lesson.startTime = startTime;
            lesson.endTime = endTime;
            lesson.venue = venue;
            lesson.topic = topic;
        }

        await targetTimetable.save();

        res.status(200).json({
            success: true,
            message: isGroupChanged ? "Lesson moved successfully" : "Lesson updated successfully",
            data: targetTimetable
        });

    } catch (error) {
        console.error("Error updating lesson:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📌 DELETE A LESSON
router.delete("/lesson/:lessonId", async (req, res) => {
    try {
        const { lessonId } = req.params;
        
        const result = await Timetable.updateOne(
            { "lessons._id": lessonId },
            { $pull: { lessons: { _id: lessonId } } }
        );

        if (result.modifiedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Lesson not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Lesson deleted successfully"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📌 Add an Exam (GROUP-BASED with conflict prevention)
router.post("/exam", async (req, res) => {
    try {
        const { examDate, startTime, endTime, venue, examName, tutorId, groupId } = req.body;

        // Validate required fields
        if (!examDate || !startTime || !endTime || !venue || !examName || !tutorId || !groupId) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }

        // Find or create timetable for the specified group
        let timetable = await Timetable.findOne({ groupId, createdBy: tutorId });

        if (!timetable) {
            // Create new timetable if it doesn't exist
            const tutor = await Tutor.findById(tutorId);
            if (!tutor) {
                return res.status(404).json({
                    success: false,
                    message: "Tutor not found"
                });
            }

            const tutorName = `${tutor.firstName} ${tutor.lastName}`;

            timetable = new Timetable({
                groupId,
                tutorName,
                lessons: [],
                exams: [],
                events: [],
                createdBy: tutorId
            });
        }

        // Get all timetables to check for global conflicts
        const allTimetables = await Timetable.find({});

        // Helper function to check time overlap
        const isTimeOverlap = (start1, end1, start2, end2) => {
            return (
                (start1 >= start2 && start1 < end2) ||
                (end1 > start2 && end1 <= end2) ||
                (start1 <= start2 && end1 >= end2)
            );
        };

        // Check for conflicts across all timetables
        const hasConflict = allTimetables.some(tt => {
            // Check lessons
            const lessonConflict = tt.lessons.some(lesson =>
                lesson.date.toISOString().split("T")[0] === examDate &&
                lesson.venue === venue &&
                isTimeOverlap(startTime, endTime, lesson.startTime, lesson.endTime)
            );

            // Check exams
            const examConflict = tt.exams.some(exam =>
                exam.examDate.toISOString().split("T")[0] === examDate &&
                exam.venue === venue &&
                isTimeOverlap(startTime, endTime, exam.startTime, exam.endTime)
            );

            // Check events
            const eventConflict = tt.events.some(event =>
                event.eventDate.toISOString().split("T")[0] === examDate &&
                event.venue === venue &&
                isTimeOverlap(startTime, endTime, event.startTime, event.endTime)
            );

            return lessonConflict || examConflict || eventConflict;
        });

        if (hasConflict) {
            return res.status(400).json({
                success: false,
                message: "The venue is already booked for this time slot in another timetable"
            });
        }

        // No conflicts found, add the new exam
        timetable.exams.push({
            examDate,
            startTime,
            endTime,
            venue,
            examName,
            invigilatorId: tutorId,
        });

        await timetable.save();

        res.status(201).json({
            success: true,
            message: "Exam added successfully",
            data: timetable
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📌 Update an Exam (FIXED - excludes current exam from conflict check)
router.put("/exam/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { examDate, startTime, endTime, venue, examName, tutorId, groupId, originalGroupId } = req.body;

        if (!examDate || !startTime || !endTime || !venue || !examName || !tutorId || !groupId) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }

        // Check if group is being changed
        const isGroupChanged = originalGroupId && originalGroupId !== groupId;

        let sourceTimetable = null;
        let exam = null;

        // If group is being changed, find the exam in the original timetable first
        if (isGroupChanged) {
            sourceTimetable = await Timetable.findOne({
                groupId: originalGroupId,
                createdBy: tutorId
            });

            if (!sourceTimetable) {
                return res.status(404).json({
                    success: false,
                    message: "Source timetable not found."
                });
            }

            // Find the exam in the source timetable
            exam = sourceTimetable.exams.id(id);
            if (!exam) {
                return res.status(404).json({
                    success: false,
                    message: "Exam not found in source timetable"
                });
            }
        }

        // Find or create the target timetable
        let targetTimetable = await Timetable.findOne({
            groupId: groupId,
            createdBy: tutorId
        });

        if (!targetTimetable) {
            // Create new timetable if it doesn't exist
            const tutor = await Tutor.findById(tutorId);
            if (!tutor) {
                return res.status(404).json({
                    success: false,
                    message: "Tutor not found"
                });
            }

            const tutorName = `${tutor.firstName} ${tutor.lastName}`;

            targetTimetable = new Timetable({
                groupId,
                tutorName,
                lessons: [],
                exams: [],
                events: [],
                createdBy: tutorId
            });
        }

        // Get all timetables to check for global conflicts
        const allTimetables = await Timetable.find({});

        const isTimeOverlap = (start1, end1, start2, end2) => {
            return (
                (start1 >= start2 && start1 < end2) ||
                (end1 > start2 && end1 <= end2) ||
                (start1 <= start2 && end1 >= end2)
            );
        };

        // Check for conflicts across all timetables (excluding the current exam)
        const hasConflict = allTimetables.some(tt => {
            // Check if this is the target timetable
            const isTargetTimetable = tt._id.toString() === targetTimetable._id.toString();

            // Check exams (excluding the current exam if it's in the target timetable)
            const examConflict = tt.exams.some(examItem => {
                // Skip if this is the exam being edited
                if (examItem._id.toString() === id) return false;
                
                return examItem.examDate.toISOString().split("T")[0] === examDate &&
                       examItem.venue === venue &&
                       isTimeOverlap(startTime, endTime, examItem.startTime, examItem.endTime);
            });

            // Check lessons
            const lessonConflict = tt.lessons.some(lesson =>
                lesson.date.toISOString().split("T")[0] === examDate &&
                lesson.venue === venue &&
                isTimeOverlap(startTime, endTime, lesson.startTime, lesson.endTime)
            );

            // Check events
            const eventConflict = tt.events.some(event =>
                event.eventDate.toISOString().split("T")[0] === examDate &&
                event.venue === venue &&
                isTimeOverlap(startTime, endTime, event.startTime, event.endTime)
            );

            return examConflict || lessonConflict || eventConflict;
        });

        if (hasConflict) {
            return res.status(400).json({
                success: false,
                message: "The venue is already booked for this time slot in another timetable"
            });
        }

        // ... rest of your existing exam update logic remains the same ...
        // Handle group transfer
        if (isGroupChanged) {
            // Remove exam from source timetable
            sourceTimetable.exams = sourceTimetable.exams.filter(
                e => e._id.toString() !== id
            );
            await sourceTimetable.save();

            // Add exam to target timetable with updated information
            targetTimetable.exams.push({
                examDate,
                startTime,
                endTime,
                venue,
                examName,
                invigilatorId: tutorId,
                attended: exam.attended,
                isMarked: exam.isMarked,
                attendedStudents: exam.attendedStudents,
                absentStudents: exam.absentStudents
            });
        } else {
            // Regular update - find exam in target timetable
            exam = targetTimetable.exams.id(id);
            if (!exam) {
                return res.status(404).json({
                    success: false,
                    message: "Exam not found in target timetable"
                });
            }

            // Store original date for comparison
            const originalExamDate = exam.examDate;

            // Check if the exam is being rescheduled to a future date
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const newDate = new Date(examDate);
            const oldDate = new Date(originalExamDate);

            // If new date is in the future (after today) and different from the original date
            if (newDate > today && newDate.getTime() !== oldDate.getTime()) {
                // Reset attendance tracking
                exam.attended = false;
                exam.isMarked = false;
                exam.attendedStudents = [];
                exam.absentStudents = [];
            }

            // Update the exam
            exam.examDate = examDate;
            exam.startTime = startTime;
            exam.endTime = endTime;
            exam.venue = venue;
            exam.examName = examName;
            exam.invigilatorId = tutorId;
        }

        await targetTimetable.save();

        res.status(200).json({
            success: true,
            message: isGroupChanged ? "Exam moved successfully" : "Exam updated successfully",
            data: targetTimetable
        });
    } catch (error) {
        console.error("Error updating exam:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📌 DELETE AN EXAM
router.delete("/exam/:examId", async (req, res) => {
    try {
        const { examId } = req.params;
        
        const result = await Timetable.updateOne(
            { "exams._id": examId },
            { $pull: { exams: { _id: examId } } }
        );

        if (result.modifiedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Exam not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Exam deleted successfully"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📌 Add an Event (GROUP-BASED)
router.post("/event", async (req, res) => {
    try {
        const { eventDate, startTime, endTime, venue, eventDescription, organizerId, groupIds } = req.body;

        // if group id is black array, return
        console.log(`groupIds`, groupIds);

        // Validate required fields
        if (!eventDate || !startTime || !endTime || !venue || !eventDescription || !organizerId || !groupIds) {
            return res.status(400).json({ success: false, message: "All fields are required" });
        }

        // Helper function to check time overlap
        const isTimeOverlap = (start1, end1, start2, end2) => {
            return (
                (start1 >= start2 && start1 < end2) ||
                (end1 > start2 && end1 <= end2) ||
                (start1 <= start2 && end1 >= end2)
            );
        };

        // Get all timetables to check for venue conflicts
        const allTimetables = await Timetable.find({});

        // Check for venue conflicts across all timetables
        const hasVenueConflict = allTimetables.some(tt => {
            // Check lessons
            const lessonConflict = tt.lessons.some(lesson =>
                lesson.date.toISOString().split("T")[0] === eventDate &&
                lesson.venue === venue &&
                isTimeOverlap(startTime, endTime, lesson.startTime, lesson.endTime)
            );

            // Check exams
            const examConflict = tt.exams.some(exam =>
                exam.examDate.toISOString().split("T")[0] === eventDate &&
                exam.venue === venue &&
                isTimeOverlap(startTime, endTime, exam.startTime, exam.endTime)
            );

            // Check events
            const eventConflict = tt.events.some(event =>
                event.eventDate.toISOString().split("T")[0] === eventDate &&
                event.venue === venue &&
                isTimeOverlap(startTime, endTime, event.startTime, event.endTime)
            );

            return lessonConflict || examConflict || eventConflict;
        });

        if (hasVenueConflict) {
            return res.status(400).json({
                success: false,
                message: "The venue is already booked for this time slot"
            });
        }

        // Create event object
        const eventObject = {
            eventDate,
            startTime,
            endTime,
            venue,
            eventDescription,
            organizerId
        };

        // Handle different group selection cases
        if (groupIds === "all") {
            // Add event to all groups
            await Promise.all(allTimetables.map(async (timetable) => {
                await Timetable.updateOne(
                    { _id: timetable._id },
                    { $push: { events: eventObject } }
                );
            }));
        } else if (Array.isArray(groupIds)) {
            // Add event to specific groups
            await Promise.all(groupIds.map(async (groupId) => {
                // Find or create timetable for each group
                let timetable = await Timetable.findOne({ groupId });
                console.log(`single timetable returned`, timetable);
                if (!timetable) {
                    return res.status(400).json({ success: false, message: "Group not found in DB" });
                } else {
                    await Timetable.updateOne(
                        { groupId },
                        { $push: { events: eventObject } }
                    );
                }
            }));
        } else {
            // Add event to a single group
            let timetable = await Timetable.findOne({ groupId: groupIds });
            if (!timetable) {
                // Create a new timetable for this group if it doesn't exist
                timetable = new Timetable({
                    groupId: groupIds,
                    tutorName: "System",
                    lessons: [],
                    exams: [],
                    events: [eventObject],
                    createdBy: organizerId
                });
                await timetable.save();
            } else {
                await Timetable.updateOne(
                    { groupId: groupIds },
                    { $push: { events: eventObject } }
                );
            }
        }

        res.status(201).json({
            success: true,
            message: "Event added successfully"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📌 Update an Event (FIXED - excludes current event from conflict check)
router.put("/event/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { eventDate, startTime, endTime, venue, eventDescription, organizerId, groupIds, tutorId } = req.body;

        if (!eventDate || !startTime || !endTime || !venue || !eventDescription || !organizerId || !groupIds) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }

        // Find the timetable containing the event
        let timetable = await Timetable.findOne({ "events._id": id });
        if (!timetable) {
            return res.status(404).json({
                success: false,
                message: "Event not found"
            });
        }

        const allTimetables = await Timetable.find({});

        // Helper function to check time overlap
        const isTimeOverlap = (start1, end1, start2, end2) => {
            return (
                (start1 >= start2 && start1 < end2) ||
                (end1 > start2 && end1 <= end2) ||
                (start1 <= start2 && end1 >= end2)
            );
        };

        // Check for conflicts across all timetables (excluding this event)
        const hasConflict = allTimetables.some(tt => {
            // Check all event types but exclude the current event
            const lessonConflict = tt.lessons.some(lesson =>
                lesson.date.toISOString().split("T")[0] === eventDate &&
                lesson.venue === venue &&
                isTimeOverlap(startTime, endTime, lesson.startTime, lesson.endTime)
            );

            const examConflict = tt.exams.some(exam =>
                exam.examDate.toISOString().split("T")[0] === eventDate &&
                exam.venue === venue &&
                isTimeOverlap(startTime, endTime, exam.startTime, exam.endTime)
            );

            const eventConflict = tt.events.some(event =>
                event._id.toString() !== id && // Exclude the current event
                event.eventDate.toISOString().split("T")[0] === eventDate &&
                event.venue === venue &&
                isTimeOverlap(startTime, endTime, event.startTime, event.endTime)
            );

            return lessonConflict || examConflict || eventConflict;
        });

        if (hasConflict) {
            return res.status(400).json({
                success: false,
                message: "Time conflict detected - venue already booked for this time slot"
            });
        }

        // ... rest of your existing event update logic remains the same ...
        // First, remove the event from all timetables
        await Timetable.updateMany(
            { "events._id": id },
            { $pull: { events: { _id: id } } }
        );

        // Create updated event object
        const updatedEvent = {
            eventDate,
            startTime,
            endTime,
            venue,
            eventDescription,
            organizerId,
            _id: id // Preserve the original ID
        };

        // Add the updated event to the specified groups
        if (groupIds === "all") {
            // Add to all timetables
            await Timetable.updateMany(
                {},
                { $push: { events: updatedEvent } }
            );
        } else if (Array.isArray(groupIds)) {
            // Add to specific groups
            for (const groupId of groupIds) {
                let targetTimetable = await Timetable.findOne({ groupId });

                if (!targetTimetable) {
                    // Create new timetable if it doesn't exist
                    const tutor = await Tutor.findById(tutorId);
                    if (!tutor) {
                        return res.status(404).json({
                            success: false,
                            message: "Tutor not found"
                        });
                    }

                    const tutorName = `${tutor.firstName} ${tutor.lastName}`;

                    targetTimetable = new Timetable({
                        groupId,
                        tutorName,
                        lessons: [],
                        exams: [],
                        events: [updatedEvent],
                        createdBy: tutorId
                    });
                    await targetTimetable.save();
                } else {
                    await Timetable.updateOne(
                        { groupId },
                        { $push: { events: updatedEvent } }
                    );
                }
            }
        } else {
            // Single group
            let targetTimetable = await Timetable.findOne({ groupId: groupIds });

            if (!targetTimetable) {
                // Create new timetable if it doesn't exist
                const tutor = await Tutor.findById(tutorId);
                if (!tutor) {
                    return res.status(404).json({
                        success: false,
                        message: "Tutor not found"
                    });
                }

                const tutorName = `${tutor.firstName} ${tutor.lastName}`;

                targetTimetable = new Timetable({
                    groupId,
                    tutorName,
                    lessons: [],
                    exams: [],
                    events: [updatedEvent],
                    createdBy: tutorId
                });
                await targetTimetable.save();
            } else {
                await Timetable.updateOne(
                    { groupId: groupIds },
                    { $push: { events: updatedEvent } }
                );
            }
        }

        res.status(200).json({
            success: true,
            message: "Event updated successfully"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📌 DELETE AN EVENT
router.delete("/event/:eventId", async (req, res) => {
    try {
        const { eventId } = req.params;
        
        // Remove event from all timetables (since events can be shared across groups)
        const result = await Timetable.updateMany(
            { "events._id": eventId },
            { $pull: { events: { _id: eventId } } }
        );

        if (result.modifiedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Event not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Event deleted successfully"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📌 Get Timetable by Tutor Id and Group Id
router.get("/:tutorId/:groupId", async (req, res) => {
    const { tutorId, groupId } = req.params;
    try {
        let timetable = await Timetable.findOne({
            createdBy: tutorId,
            groupId: groupId
        })
            .populate('groupId', 'groupName timeSlot')
            .populate('lessons.tutorId', 'firstName lastName')
            .populate('exams.invigilatorId', 'firstName lastName')
            .populate('events.organizerId', 'firstName lastName');

        if (!timetable) {
            return res.status(404).json({
                success: true,
                message: "No timetable found for this tutor and group combination"
            });
        }

        res.status(200).json({
            success: true,
            message: "Timetable retrieved successfully",
            data: timetable
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📌 Get ALL Timetables by Tutor Id
router.get("/:tutorId", async (req, res) => {
    const { tutorId } = req.params;
    try {
        // Use find() instead of findOne() to get ALL timetables for this tutor
        let timetables = await Timetable.find({ createdBy: tutorId })
            .populate('groupId', 'groupName timeSlot status') // Populate group details
            .populate('lessons.tutorId', 'firstName lastName') // Populate lesson tutor details
            .populate('exams.invigilatorId', 'firstName lastName') // Populate exam invigilator details
            .populate('events.organizerId', 'firstName lastName'); // Populate event organizer details

        if (!timetables || timetables.length === 0) {
            return res.status(404).json({
                success: true,
                message: "You have not created any timetables yet"
            });
        }

        res.status(200).json({
            success: true,
            message: "Timetables retrieved successfully",
            data: timetables
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

router.post("/attendance", async (req, res) => {
    try {
        const { studentId, eventId, eventType, status } = req.body;

        if (!studentId || !eventId || !eventType || !status) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // 🔹 Find the student
        const student = await Student.findById(studentId);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        // 🔹 Find the timetable event
        let timetable = await Timetable.findOne({
            $or: [
                { "lessons._id": eventId },
                { "exams._id": eventId }
            ]
        });

        if (!timetable) {
            return res.status(404).json({ error: "Event not found in any timetable" });
        }

        let updated = false;
        const formattedDate = new Date();
        let attendanceRecord = {};

        if (eventType === "lesson") {
            const lesson = timetable.lessons.find(l => l._id.toString() === eventId);
            if (lesson) {
                attendanceRecord = {
                    date: formattedDate,
                    topic: lesson.topic,
                    event: "lesson",
                    tutorId: lesson.tutorId
                };
                if (!lesson.attendedStudents.includes(studentId)) {
                    if (status === 'present') {
                        lesson.attendedStudents.push(studentId);
                    } else if (status === 'absent') {
                        lesson.absentStudents.push(studentId);
                    }
                    updated = true;
                }
            }
        } else if (eventType === "exam") {
            const exam = timetable.exams.find(e => e._id.toString() === eventId);
            if (exam) {
                attendanceRecord = {
                    date: formattedDate,
                    topic: exam.examName,
                    event: "exam",
                    tutorId: exam.invigilatorId
                }
                if (!exam.attendedStudents.includes(studentId)) {
                    if (status === 'present') {
                        exam.attendedStudents.push(studentId);
                    } else if (status === 'absent') {
                        exam.absentStudents.push(studentId);
                    }
                    updated = true;
                }
            }
        } else {
            return res.status(400).json({ error: "Invalid event type" });
        }

        if (!updated) {
            return res.status(400).json({ error: "Student already recorded for this event" });
        }

        // 🔹 Update Student Attendance Record with structured data
        if (status === "present") {
            student.attendance.attended.push(attendanceRecord);
        } else if (status === "absent") {
            student.attendance.absent.push(attendanceRecord);
        } else {
            return res.status(400).json({ error: "Invalid status. Use 'present' or 'absent'." });
        }

        // 🔹 Save both documents
        await student.save();
        await timetable.save();

        res.status(200).json({
            success: true,
            message: `Attendance recorded as ${status}`,
            data: {
                studentAttendance: student.attendance,
                timetableUpdated: true
            }
        });

    } catch (error) {
        console.log(error);
        res.status(500).json({ error: error.message });
    }
});

router.post("/attendance/tutor", async (req, res) => {
    try {
        const { eventId, eventType, attended } = req.body;

        // Validate required fields
        if (!eventId || !eventType || attended === undefined) {
            return res.status(400).json({
                success: false,
                message: "All fields are required: eventId, eventType, and attended status"
            });
        }

        // Find the timetable containing the event
        let timetable;
        if (eventType === "lesson") {
            timetable = await Timetable.findOne({ "lessons._id": eventId });
            if (!timetable) {
                return res.status(404).json({
                    success: false,
                    message: "Lesson not found"
                });
            }

            // Update the specific lesson
            const updatedTimetable = await Timetable.findOneAndUpdate(
                { "lessons._id": eventId },
                {
                    $set: {
                        "lessons.$.attended": attended,
                        "lessons.$.isMarked": true
                    }
                },
                { new: true }
            );

            return res.status(200).json({
                success: true,
                message: "Tutor attendance marked successfully",
                data: updatedTimetable
            });

        } else if (eventType === "exam") {
            timetable = await Timetable.findOne({ "exams._id": eventId });
            if (!timetable) {
                return res.status(404).json({
                    success: false,
                    message: "Exam not found"
                });
            }

            // Update the specific exam
            const updatedTimetable = await Timetable.findOneAndUpdate(
                { "exams._id": eventId },
                {
                    $set: {
                        "exams.$.attended": attended,
                        "exams.$.isMarked": true
                    }
                },
                { new: true }
            );

            return res.status(200).json({
                success: true,
                message: "Tutor attendance marked successfully",
                data: updatedTimetable
            });

        } else {
            return res.status(400).json({
                success: false,
                message: "Invalid event type. Must be either 'lesson' or 'exam'"
            });
        }

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📌 Delete a Lesson (GROUP-BASED)
router.delete("/:groupId/lesson/:lessonId", async (req, res) => {
    try {
        const { groupId, lessonId } = req.params;
        const timetable = await Timetable.findOne({ groupId });

        if (!timetable) {
            return res.status(404).json({ success: false, message: "Timetable not found" });
        }

        timetable.lessons = timetable.lessons.filter(lesson => lesson._id.toString() !== lessonId);
        await timetable.save();

        res.status(200).json({ success: true, message: "Lesson deleted", data: timetable });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 📌 Delete an Exam
router.delete("/:cohort/exam/:examId", async (req, res) => {
    try {
        const { cohort, examId } = req.params;
        const timetable = await Timetable.findOne({ cohort });

        if (!timetable) {
            return res.status(404).json({ success: false, message: "Timetable not found" });
        }

        timetable.exams = timetable.exams.filter(exam => exam._id.toString() !== examId);
        await timetable.save();

        res.status(200).json({ success: true, message: "Exam deleted", data: timetable });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 📌 Delete an Event (GROUP-BASED)
router.delete("/event/:eventId", async (req, res) => {
    try {
        const { eventId } = req.params;

        // Remove the event from all timetables that contain it
        const result = await Timetable.updateMany(
            { "events._id": eventId },
            { $pull: { events: { _id: eventId } } }
        );

        if (result.modifiedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Event not found in any timetable"
            });
        }

        res.status(200).json({
            success: true,
            message: "Event deleted successfully from all timetables",
            deletedCount: result.modifiedCount
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
