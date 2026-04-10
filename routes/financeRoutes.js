const express = require('express');
const router = express.Router();
const Tutor = require('../models/Tutor');
const mongoose = require('mongoose');

// GET /finance/tutors - Get all tutors with settlement data
router.get('/tutors', async (req, res) => {
    try {
        const tutors = await Tutor.find({})
            .select('firstName lastName email phone profilePicture myStudents certifiedStudents')
            .lean();

        // Calculate financial metrics
        const financialStats = tutors.reduce((stats, tutor) => {
            const allStudents = [...(tutor.myStudents || []), ...(tutor.certifiedStudents || [])];
            
            allStudents.forEach(student => {
                const courseFee = student.courseFee || 10000;
                const tutorShare = courseFee * 0.15;
                const adminShare = courseFee * 0.85;
                
                stats.totalRevenue += courseFee;
                
                if (student.settlement?.status === 'PAID') {
                    stats.totalPaidToTutors += student.settlement.amount || tutorShare;
                    stats.adminRevenue += adminShare;
                } else {
                    stats.totalPendingToTutors += tutorShare;
                    stats.adminRevenue += adminShare;
                }
            });
            
            stats.totalStudents += allStudents.length;
            return stats;
        }, {
            totalRevenue: 0,
            totalPaidToTutors: 0,
            totalPendingToTutors: 0,
            adminRevenue: 0,
            totalStudents: 0,
            totalTutors: tutors.length
        });

        res.status(200).json({
            status: 'success',
            data: {
                tutors,
                stats: financialStats
            }
        });
    } catch (error) {
        console.error('Finance data fetch error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch finance data'
        });
    }
});

// POST /finance/process-payment - Process payment to tutor
router.post('/process-payment', async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { tutorId, studentId, amount, phone, transactionId, notes } = req.body;
        
        if (!tutorId || !studentId || !amount || !phone || !transactionId) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                status: 'error',
                message: 'Missing required fields'
            });
        }

        const tutor = await Tutor.findById(tutorId).session(session);
        if (!tutor) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({
                status: 'error',
                message: 'Tutor not found'
            });
        }

        // Update settlement in myStudents
        let studentFound = false;
        const updatedMyStudents = (tutor.myStudents || []).map(student => {
            if (String(student.studentId) === String(studentId)) {
                studentFound = true;
                return {
                    ...student,
                    settlement: {
                        status: 'PAID',
                        amount: parseFloat(amount),
                        phone,
                        transactionId,
                        timeOfPayment: new Date(),
                        notes
                    }
                };
            }
            return student;
        });

        // Update settlement in certifiedStudents if not found in myStudents
        const updatedCertifiedStudents = (tutor.certifiedStudents || []).map(student => {
            if (String(student.studentId) === String(studentId)) {
                studentFound = true;
                return {
                    ...student,
                    settlement: {
                        status: 'PAID',
                        amount: parseFloat(amount),
                        phone,
                        transactionId,
                        timeOfPayment: new Date(),
                        notes
                    }
                };
            }
            return student;
        });

        if (!studentFound) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({
                status: 'error',
                message: 'Student not found for this tutor'
            });
        }

        // Save updated tutor
        tutor.myStudents = updatedMyStudents;
        tutor.certifiedStudents = updatedCertifiedStudents;
        await tutor.save({ session });

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            status: 'success',
            message: 'Payment processed successfully'
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Process payment error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to process payment'
        });
    }
});

module.exports = router;