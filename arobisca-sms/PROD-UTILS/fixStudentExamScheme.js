const mongoose = require('mongoose');
const Student = require('../models/student');
const Course = require('../models/courses');

/**
 * Utility script to fix students with empty exams arrays
 * This script:
 * 1. Finds students with empty exams array
 * 2. Fetches their course document (handles both ObjectId and course name strings)
 * 3. Corrects the course field to use proper ObjectId
 * 4. Populates the exams array with the course exam scheme (name, weight, score: 0)
 * 
 * Run this once to fix students already enrolled in the system
 */
async function fixStudentExamScheme() {
    try {
        // Connect to MongoDB - UPDATE THIS CONNECTION STRING WITH YOUR DB CREDENTIALS
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://arobiscasms:HpdTZJ5LlS6EbJFk@arobisca-sms.k2o9l.mongodb.net/Arobisca?retryWrites=true&w=majority&appName=Arobisca-SMS', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('✅ Connected to MongoDB');
        console.log('🔍 Searching for students with empty exams array...\n');

        // Find students with empty or missing exams array
        const studentsWithEmptyExams = await Student.find({
            $or: [
                { exams: { $exists: false } },
                { exams: { $size: 0 } },
                { exams: [] }
            ],
            course: { $exists: true, $ne: null }
        });

        console.log(`📊 Found ${studentsWithEmptyExams.length} students with empty exams array\n`);

        if (studentsWithEmptyExams.length === 0) {
            console.log('✅ No students need fixing. All students have exam schemes assigned.');
            await mongoose.connection.close();
            return;
        }

        let updatedCount = 0;
        let errorCount = 0;
        let skippedCount = 0;

        // Process each student
        for (const student of studentsWithEmptyExams) {
            try {
                let courseDoc = null;
                
                // Try to fetch course by ID first
                try {
                    courseDoc = await Course.findById(student.course);
                } catch (idError) {
                    // If failed, it's likely a course name string, not an ObjectId
                    courseDoc = null;
                }

                // If not found by ID, try to find by name (case-insensitive)
                if (!courseDoc) {
                    // Use regex for flexible matching (handles typos, extra spaces, etc.)
                    courseDoc = await Course.findOne({ 
                        name: { $regex: new RegExp(`^${student.course.trim()}$`, 'i') }
                    });
                    
                    // If still not found, try partial matching
                    if (!courseDoc) {
                        courseDoc = await Course.findOne({ 
                            name: { $regex: new RegExp(student.course.trim(), 'i') }
                        });
                    }
                }

                if (!courseDoc) {
                    console.log(`⚠️  Skipped: ${student.firstName} ${student.lastName} (${student.admissionNumber}) - Course "${student.course}" not found in database`);
                    skippedCount++;
                    continue;
                }

                // Check if course has an exam scheme
                if (!courseDoc.examScheme || courseDoc.examScheme.length === 0) {
                    console.log(`⚠️  Skipped: ${student.firstName} ${student.lastName} (${student.admissionNumber}) - Course "${courseDoc.name}" has no exam scheme`);
                    skippedCount++;
                    continue;
                }

                // Fix the course field to use the proper ObjectId
                student.course = courseDoc._id;
                
                // Map exam scheme to student exams array
                student.exams = courseDoc.examScheme.map(exam => ({
                    name: exam.name,
                    weight: exam.weight,
                    score: 0
                }));

                // Save the student
                await student.save();

                updatedCount++;
                console.log(`✅ Updated: ${student.firstName} ${student.lastName} (${student.admissionNumber})`);
                console.log(`   Course: "${courseDoc.name}" (ID: ${courseDoc._id})`);
                console.log(`   Assigned ${student.exams.length} exams: ${student.exams.map(e => e.name).join(', ')}\n`);

            } catch (error) {
                errorCount++;
                console.error(`❌ Error updating student ${student.admissionNumber}:`, error.message);
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('📋 MIGRATION SUMMARY');
        console.log('='.repeat(60));
        console.log(`✅ Successfully updated: ${updatedCount} students`);
        console.log(`⚠️  Skipped: ${skippedCount} students`);
        console.log(`❌ Errors: ${errorCount} students`);
        console.log(`📊 Total processed: ${studentsWithEmptyExams.length} students`);
        console.log('='.repeat(60) + '\n');

        if (updatedCount > 0) {
            console.log('🎉 Migration completed successfully!');
        }

        // Close the connection
        await mongoose.connection.close();
        console.log('👋 Database connection closed');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        await mongoose.connection.close();
        process.exit(1);
    }
}

// Run the migration
if (require.main === module) {
    fixStudentExamScheme()
        .then(() => {
            console.log('\n✨ Script execution completed');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 Script execution failed:', error);
            process.exit(1);
        });
}

module.exports = fixStudentExamScheme;
