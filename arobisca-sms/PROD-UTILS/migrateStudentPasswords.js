const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Student = require('../models/student');

async function migrateStudentPasswords() {
    try {
        // Connect to MongoDB
        await mongoose.connect('mongodb+srv://arobiscasms:HpdTZJ5LlS6EbJFk@arobisca-sms.k2o9l.mongodb.net/Arobisca?retryWrites=true&w=majority&appName=Arobisca-SMS', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('Connected to MongoDB');

        // Find students without passwords
        const studentsWithoutPasswords = await Student.find({
            $or: [
                { password: { $exists: false } },
                { password: null },
                { password: '' }
            ],
            phoneNumber: { $exists: true, $ne: null, $ne: '' }
        });

        console.log(`Found ${studentsWithoutPasswords.length} students without passwords`);

        let updatedCount = 0;
        let errorCount = 0;

        // Update each student
        for (const student of studentsWithoutPasswords) {
            try {
                if (student.phoneNumber) {
                    const salt = await bcrypt.genSalt(10);
                    const hashedPassword = await bcrypt.hash(student.phoneNumber, salt);
                    
                    student.password = hashedPassword;
                    await student.save();
                    
                    updatedCount++;
                    console.log(`Updated password for: ${student.firstName} ${student.lastName} (${student.admissionNumber})`);
                }
            } catch (error) {
                errorCount++;
                console.error(`Error updating student ${student.admissionNumber}:`, error.message);
            }
        }

        console.log('\nMigration completed!');
        console.log(`Successfully updated: ${updatedCount} students`);
        console.log(`Errors encountered: ${errorCount} students`);
        
        mongoose.disconnect();
        process.exit(0);

    } catch (error) {
        console.error('Migration failed:', error);
        mongoose.disconnect();
        process.exit(1);
    }
}

// Run the migration
migrateStudentPasswords();