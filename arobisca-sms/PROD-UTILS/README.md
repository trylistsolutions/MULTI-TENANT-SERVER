# Production Utilities

This folder contains utility scripts for database migrations and fixes.

## Available Scripts

### 1. fixStudentExamScheme.js
Fixes students with empty `exams` arrays by populating them with their course's exam scheme.

**When to use:**
- After updating the admission process
- If students were enrolled before exam scheme assignment was implemented
- When students have empty exam arrays and need them populated

**What it does:**
1. Finds all students with empty or missing `exams` array
2. Fetches their enrolled course document
3. Copies the course's `examScheme` to the student's `exams` array
4. Each exam is initialized with `score: 0`

**How to run:**

```bash
# Navigate to NODE directory
cd NODE

# Run the script
node PROD-UTILS/fixStudentExamScheme.js
```

**Expected output:**
```
✅ Connected to MongoDB
🔍 Searching for students with empty exams array...

📊 Found 15 students with empty exams array

✅ Updated: John Doe (ADM-2024-001) - Course: Computer Science
   Assigned 4 exams: CAT 1, CAT 2, Final Exam, Project

...

============================================================
📋 MIGRATION SUMMARY
============================================================
✅ Successfully updated: 15 students
⚠️  Skipped: 0 students
❌ Errors: 0 students
📊 Total processed: 15 students
============================================================

🎉 Migration completed successfully!
```

**Important Notes:**
- ✅ Safe to run multiple times - skips students who already have exams
- ✅ Non-destructive - only updates students with empty exams array
- ⚠️  Requires valid course reference - skips students with invalid courses
- ⚠️  Make sure MongoDB connection string is correct in the script

### 2. migrateStudentPasswords.js
Migrates passwords for students who were enrolled without passwords.

**How to run:**
```bash
node PROD-UTILS/migrateStudentPasswords.js
```

---

## Development Notes

When creating new migration scripts:
1. Always include detailed console logging
2. Handle errors gracefully
3. Provide summary statistics
4. Make scripts idempotent (safe to run multiple times)
5. Close database connections properly
