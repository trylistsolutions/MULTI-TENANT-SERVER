const express = require('express');
const asyncHandler = require('express-async-handler');
const Staff = require('../models/staff');
const Tutor = require('../models/tutors');
const Student = require('../models/student');
const FinancialRecords = require("../models/finance");

const router = express.Router();

// Function to get month-year string
const getMonthYear = (date) => {
  return new Date(date).toLocaleString("en-US", { month: "long", year: "numeric" });
};

// Get financial records (optionally filter by year)
router.get("/", asyncHandler(async (req, res) => {
  try {
    const { year } = req.query;

    // If a year is provided, only return records for that year (month stored as "Month Year")
    const query = {}
    if (year) {
      // match month string ending with the year, e.g. "January 2026"
      query.month = new RegExp(`${year}$`)
    }

    const records = await FinancialRecords.find(query);
    res.json({ success: true, message: "Records Retrieved Successfully", data: records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));

// Yearly financial report - aggregate server-side for a given year
router.get("/report/year/:year", asyncHandler(async (req, res) => {
  try {
    const { year } = req.params;
    const yearNum = parseInt(year);
    if (isNaN(yearNum) || year.toString().length !== 4) {
      return res.status(400).json({ success: false, message: "Invalid year. Must be 4 digits like '2024'" });
    }

    // Find all monthly records for the year (month stored like "January 2026")
    const records = await FinancialRecords.find({ month: new RegExp(`${year}$`) });

    // Aggregate documents
    let totalInvoiceAmount = 0;
    let totalReceiptAmount = 0;
    let totalBillAmount = 0;
    const invoices = [];
    const receipts = [];
    const bills = [];

    records.forEach(rec => {
      const invs = Array.isArray(rec.invoices) ? rec.invoices : (rec.invoices ? Object.values(rec.invoices) : [])
      const recs = Array.isArray(rec.receipts) ? rec.receipts : (rec.receipts ? Object.values(rec.receipts) : [])
      const bks = Array.isArray(rec.bills) ? rec.bills : (rec.bills ? Object.values(rec.bills) : [])

      invs.forEach(i => {
        const amt = Number(i.totalAmountDue || 0)
        totalInvoiceAmount += amt
        invoices.push(i)
      })

      recs.forEach(r => {
        const amt = Number(r.totalAmountDue || r.amount || 0)
        totalReceiptAmount += amt
        receipts.push(r)
      })

      bks.forEach(b => {
        const amt = Number(b.amount || 0)
        totalBillAmount += amt
        bills.push(b)
      })
    })

    // Build student analysis map
    const studentMap = new Map()
    receipts.forEach(r => {
      const admn = r.admnNumber || r.admn || r.admissionNumber || r.admissionNo
      if (!admn) return
      const prev = studentMap.get(admn) || { admissionNumber: admn, studentName: r.name || 'N/A', expected: 0, paid: 0 }
      prev.paid += Number(r.totalAmountDue || r.amount || 0)
      studentMap.set(admn, prev)
    })
    invoices.forEach(i => {
      const admn = i.admnNumber || i.admissionNumber || i.admn || i.admissionNo
      if (!admn) return
      const prev = studentMap.get(admn) || { admissionNumber: admn, studentName: i.studentName || 'N/A', expected: 0, paid: 0 }
      prev.expected += Number(i.totalAmountDue || 0)
      studentMap.set(admn, prev)
    })

    const studentAnalysis = Array.from(studentMap.values()).map(s => ({
      admissionNumber: s.admissionNumber,
      studentName: s.studentName,
      expectedFee: s.expected,
      upfrontFee: s.paid
    }))

    // Calculate staff and tutor expenses for the year
    const staffMembers = await Staff.find({})
    let staffTotal = 0, staffSalaries = 0, staffBonuses = 0
    const staffDetails = []
    for (const staff of staffMembers) {
      const salaries = (staff.salaryPayments || []).filter(p => Number(p.year) === yearNum && p.status === 'paid')
      const salarySum = salaries.reduce((s, p) => s + (Number(p.amount) || 0), 0)
      const bonuses = (staff.bonuses || []).filter(b => {
        try {
          const d = new Date(b.dateGiven || b.paidAt)
          return d.getFullYear() === yearNum && b.status === 'paid'
        } catch (e) {
          return false
        }
      })
      const bonusSum = bonuses.reduce((s, b) => s + (Number(b.amount) || 0), 0)
      if (salarySum > 0 || bonusSum > 0) {
        staffDetails.push({ name: `${staff.firstName} ${staff.lastName}`, role: staff.role, salary: salarySum, bonuses: bonusSum, total: salarySum + bonusSum })
      }
      staffSalaries += salarySum
      staffBonuses += bonusSum
    }
    staffTotal = staffSalaries + staffBonuses

    const tutors = await Tutor.find({})
    let tutorTotal = 0, tutorSalaries = 0, tutorBonuses = 0
    const tutorDetails = []
    for (const tutor of tutors) {
      const salaries = (tutor.salaryPayments || []).filter(p => Number(p.year) === yearNum && p.status === 'paid')
      const salarySum = salaries.reduce((s, p) => s + (Number(p.amount) || 0), 0)
      const bonuses = (tutor.bonuses || []).filter(b => {
        try {
          const d = new Date(b.dateGiven || b.paidAt)
          return d.getFullYear() === yearNum && b.status === 'paid'
        } catch (e) {
          return false
        }
      })
      const bonusSum = bonuses.reduce((s, b) => s + (Number(b.amount) || 0), 0)
      if (salarySum > 0 || bonusSum > 0) {
        tutorDetails.push({ name: `${tutor.firstName} ${tutor.lastName}`, role: tutor.role, salary: salarySum, bonuses: bonusSum, total: salarySum + bonusSum })
      }
      tutorSalaries += salarySum
      tutorBonuses += bonusSum
    }
    tutorTotal = tutorSalaries + tutorBonuses

    // Document totals summary
    const invoicePaid = invoices.filter(inv => inv.paymentStatus === 'Paid').length
    const invoicePending = invoices.filter(inv => inv.paymentStatus === 'Pending').length
    const billPaid = bills.filter(b => (b.status || '').toLowerCase() === 'paid').length
    const billPending = bills.length - billPaid

    const report = {
      period: `${year}`,
      generatedAt: new Date(),
      summary: {
        totalRevenue: totalReceiptAmount,
        totalExpenses: staffTotal + tutorTotal + totalInvoiceAmount + totalBillAmount,
        netProfit: totalReceiptAmount - (staffTotal + tutorTotal + totalInvoiceAmount + totalBillAmount),
        netCashFlow: totalReceiptAmount - (totalInvoiceAmount + totalBillAmount)
      },
      revenue: {
        studentFees: {
          expectedTotal: Array.from(studentMap.values()).reduce((s, v) => s + (Number(v.expected) || 0), 0),
          totalCollected: totalReceiptAmount,
          totalPending: Math.max(0, Array.from(studentMap.values()).reduce((s, v) => s + (Number(v.expected) || 0), 0) - totalReceiptAmount),
          studentCount: studentMap.size,
          collectionRate: (Array.from(studentMap.values()).reduce((s, v) => s + (Number(v.expected) || 0), 0) > 0) ? (totalReceiptAmount / Array.from(studentMap.values()).reduce((s, v) => s + (Number(v.expected) || 0), 0)) * 100 : 0,
          details: studentAnalysis.slice(0, 500)
        }
      },
      expenses: {
        staff: { total: staffTotal, totalSalaries: staffSalaries, totalBonuses: staffBonuses, staffCount: staffDetails.length, details: staffDetails },
        tutors: { total: tutorTotal, totalSalaries: tutorSalaries, totalBonuses: tutorBonuses, tutorCount: tutorDetails.length, details: tutorDetails },
        invoices: { total: totalInvoiceAmount, count: invoices.length, paid: invoicePaid, pending: invoicePending },
        bills: { total: totalBillAmount, count: bills.length, paid: billPaid, pending: billPending }
      },
      details: {
        receiptDetails: receipts.slice(0, 1000),
        studentAnalysis
      }
    }

    res.json({ success: true, message: `Yearly financial report for ${year} generated`, data: report })
  } catch (error) {
    console.error('Yearly report error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}))
 

// Update student fee with tracking
router.put('/:id/fee', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { upfrontFee, processedBy, note } = req.body;

    // Validate new fee
    if (!upfrontFee || isNaN(upfrontFee) || upfrontFee < 0) {
      return res.status(400).json({ success: false, message: "Invalid fee amount" });
    }

    // Find student by ID
    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    const previousAmount = student.upfrontFee;
    const newAmount = parseInt(upfrontFee, 10);

    // Determine change type
    let changeType;
    if (previousAmount === 0 && newAmount > 0) {
      changeType = "initial";
    } else if (newAmount > previousAmount) {
      changeType = "increase";
    } else if (newAmount < previousAmount) {
      changeType = "decrease";
    } else {
      changeType = "initial"; // no change
    }

    // Record fee update
    student.feeUpdates.push({
      amount: newAmount,
      previousAmount: previousAmount,
      changeType: changeType,
      timestamp: new Date(),
      processedBy: processedBy || "system",
      note: note || `Fee updated from ${previousAmount} to ${newAmount}`
    });

    // Update current fee
    student.upfrontFee = newAmount;
    await student.save();

    res.json({ 
      success: true, 
      message: "Fee updated successfully", 
      data: student,
      change: {
        type: changeType,
        difference: newAmount - previousAmount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));

// Update tutor or staff salary payment
router.put('/:type/:id/salary', asyncHandler(async (req, res) => {
  try {
    const { type, id } = req.params;
    const { month, year, amount, processedBy } = req.body;

    if (!["tutors", "staff"].includes(type)) {
      return res.status(400).json({ success: false, message: "Invalid type. Must be 'tutors' or 'staff'." });
    }

    const Model = type === "tutors" ? Tutor : Staff;

    const person = await Model.findById(id);
    if (!person) {
      return res.status(404).json({ success: false, message: "Person not found." });
    }

    let salaryRecord = person.salaryPayments.find(payment => payment.month === month && payment.year === year);

    if (!salaryRecord) {
      // Check if any records exist for this year
      const hasRecordsForYear = person.salaryPayments.some(payment => payment.year === year);
      
      if (!hasRecordsForYear) {
        // Create salary records for all 12 months if none exist for this year
        const monthNames = ["January", "February", "March", "April", "May", "June",
                           "July", "August", "September", "October", "November", "December"];
        
        monthNames.forEach(monthName => {
          person.salaryPayments.push({
            month: monthName,
            year: year,
            status: monthName === month ? "paid" : "pending",
            paidAt: monthName === month ? new Date() : null,
            amount: monthName === month ? amount : null,
            processedBy: monthName === month ? processedBy.username : null
          });
        });
        
        // Find the newly created record for the current month
        salaryRecord = person.salaryPayments.find(payment => payment.month === month && payment.year === year);
      } else {
        // Year records exist but specific month doesn't (shouldn't happen)
        return res.status(404).json({ success: false, message: "Salary record not found for the given month and year." });
      }
    } else {
      // Record exists, update the status and payment details
      salaryRecord.status = "paid";
      salaryRecord.amount = amount;
      salaryRecord.paidAt = new Date();
      salaryRecord.processedBy = processedBy.username;
    }

    await person.save();

    res.json({ success: true, message: "Salary payment updated successfully.", data: person });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));

// Get salary payment records for a tutor or staff member
router.get('/:type/:id/salary', asyncHandler(async (req, res) => {
  try {
    const { type, id } = req.params;

    if (!["tutors", "staff"].includes(type)) {
      return res.status(400).json({ success: false, message: "Invalid type. Must be 'tutors' or 'staff'." });
    }

    const Model = type === "tutors" ? require("../models/tutor") : require("../models/staff");

    const person = await Model.findById(id);
    if (!person) {
      return res.status(404).json({ success: false, message: "Person not found." });
    }

    res.json({ success: true, message: "Salary payment records retrieved successfully.", data: person.salaryPayments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));

// Add bonus to tutor or staff
router.post('/:type/:id/bonus', asyncHandler(async (req, res) => {
  try {
    const { type, id } = req.params;
    const { title, amount, description, processedBy } = req.body;

    if (!["tutors", "staff"].includes(type)) {
      return res.status(400).json({ success: false, message: "Invalid type. Must be 'tutors' or 'staff'." });
    }

    const Model = type === "tutors" ? Tutor : Staff;

    const person = await Model.findById(id);
    if (!person) {
      return res.status(404).json({ success: false, message: "Person not found." });
    }

    const bonus = {
      title,
      amount,
      description,
      processedBy: processedBy?.username || processedBy,
    };

    person.bonuses.push(bonus);
    await person.save();

    res.json({ success: true, message: "Bonus added successfully.", data: person });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));

// Add an Invoice
router.post("/invoice", async (req, res) => {
  try {
    const { dateOfIssue, invoiceNumber, studentName, studentAdmnNumber, courseEnrolled, totalAmountDue, paymentDueDate, } = req.body;

    // Validate required fields
    if (!dateOfIssue || !invoiceNumber || !studentName || !studentAdmnNumber || !courseEnrolled || !totalAmountDue || !paymentDueDate) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    const month = getMonthYear(dateOfIssue);

    // Find or create financial record for the specified month
    let record = await FinancialRecords.findOne({ month });

    if (!record) {
      record = new FinancialRecords({
        month,
        invoices: [],
        receipts: [],
        bills: []
      });
    }

    // Check for duplicate invoice number across all records
    const allRecords = await FinancialRecords.find({});
    const duplicateExists = allRecords.some(rec =>
      rec.invoices.some(inv => inv.invoiceNumber === invoiceNumber)
    );

    if (duplicateExists) {
      return res.status(400).json({
        success: false,
        message: `Invoice number ${invoiceNumber} already exists`
      });
    }

    // Add new invoice
    record.invoices.push({
      dateOfIssue,
      invoiceNumber,
      studentName,
      studentAdmnNumber,
      courseEnrolled,
      totalAmountDue,
      paymentDueDate
    });

    await record.save();

    res.status(201).json({
      success: true,
      message: "Invoice added successfully",
      data: record
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Add a Receipt
router.post("/receipt", asyncHandler(async (req, res) => {
  try {
    const { receiptNumber, date, name, admnNumber, nationalIdNumber, totalAmountDue, courseEnrolled, totalAmountRemaining } = req.body;

    if (!receiptNumber || !date || !name || !admnNumber || !nationalIdNumber || !totalAmountDue) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    const month = getMonthYear(date);

    let record = await FinancialRecords.findOne({ month });

    if (!record) {
      record = new FinancialRecords({
        month,
        invoices: [],
        receipts: [],
        bills: []
      });
    }

    // Check for duplicate receipt number across all records
    const allRecords = await FinancialRecords.find({});
    const duplicateExists = allRecords.some(rec =>
      rec.receipts.some(rpt => rpt.receiptNumber === receiptNumber)
    );

    if (duplicateExists) {
      return res.status(400).json({
        success: false,
        message: `Receipt number ${receiptNumber} already exists`
      });
    }

    record.receipts.push({ receiptNumber, date, name, admnNumber, nationalIdNumber, totalAmountDue, courseEnrolled, totalAmountRemaining });
    await record.save();

    res.json({ success: true, message: "Receipt added successfully", data: record });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}));

// Add a Bill
router.post("/bill", asyncHandler(async (req, res) => {
  try {
    const { billNumber, date, vendor, description, amount, dueDate, status } = req.body;

    if (!billNumber || !date || !vendor || !description || !amount || !dueDate || !status) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }
    const month = getMonthYear(date);

    let record = await FinancialRecords.findOne({ month });

    if (!record) {
      record = new FinancialRecords({
        month,
        invoices: [],
        receipts: [],
        bills: []
      });
    }

    if (record) {
      const existingBill = record.bills.find(bill => bill.billNumber === billNumber);
      if (existingBill) {
        return res.status(400).json({ success: false, message: `Bill with number ${billNumber} already exists.` });
      }
    } else {
      record = new FinancialRecords({ month, invoices: [], receipts: [], bills: [] });
    }

    // Check for duplicate receipt number across all records
    const allRecords = await FinancialRecords.find({});
    const duplicateExists = allRecords.some(rec =>
      rec.bills.some(bill => bill.billNumber === billNumber)
    );

    if (duplicateExists) {
      return res.status(400).json({
        success: false,
        message: `Bill number ${billNumber} already exists`
      });
    }

    record.bills.push({ billNumber, date, vendor, description, amount, dueDate, status });
    await record.save();

    res.json({ success: true, message: "Bill added successfully", data: record });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}));

// Update invoice/bill status
router.put("/:type/status", asyncHandler(async (req, res) => {
  const { id, status } = req.body;
  const { type } = req.params;
  
  if (!id || !status || !type) {
    return res.status(400).json({
      success: false,
      message: "ID, status, and document type are required"
    });
  }
  
  // Find all records first to search through them
  const allRecords = await FinancialRecords.find({});
  let updated = false;
  
  // Loop through all monthly records
  for (const record of allRecords) {
    if (type === 'invoice') {
      const invoiceIndex = record.invoices.findIndex(inv => inv._id.toString() === id);
      if (invoiceIndex !== -1) {
        // Update the payment status (capitalize first letter for invoices)
        record.invoices[invoiceIndex].paymentStatus = status.charAt(0).toUpperCase() + status.slice(1);
        await record.save();
        updated = true;
        break;
      }
    } else if (type === 'bill') {
      const billIndex = record.bills.findIndex(bill => bill._id.toString() === id);
      if (billIndex !== -1) {
        // Update the status (lowercase for bills)
        record.bills[billIndex].status = status.toLowerCase();
        await record.save();
        updated = true;
        break;
      }
    }
  }
  
  if (!updated) {
    return res.status(404).json({
      success: false,
      message: `${type} with ID ${id} not found`
    });
  }
  
  res.status(200).json({
    success: true,
    message: `${type} status updated successfully`
  });
}));

// Delete a document (invoice, receipt, or bill)
router.delete("/:type/:id", asyncHandler(async (req, res) => {
  const { type, id } = req.params;
  
  if (!type || !id) {
    return res.status(400).json({
      success: false,
      message: "Document type and ID are required"
    });
  }
  
  // Check if the document type is valid
  if (!['invoice', 'receipt', 'bill'].includes(type)) {
    return res.status(400).json({
      success: false,
      message: "Invalid document type. Must be 'invoice', 'receipt', or 'bill'"
    });
  }
  
  // Find all records to search through them
  const allRecords = await FinancialRecords.find({});
  let deleted = false;
  
  // Loop through all monthly records
  for (const record of allRecords) {
    const pluralType = `${type}s`; // Convert to plural (invoice -> invoices)
    
    if (record[pluralType]) {
      const itemIndex = record[pluralType].findIndex(item => item._id.toString() === id);
      
      if (itemIndex !== -1) {
        // Remove the item from the array
        record[pluralType].splice(itemIndex, 1);
        await record.save();
        deleted = true;
        break;
      }
    }
  }
  
  if (!deleted) {
    return res.status(404).json({
      success: false,
      message: `${type} with ID ${id} not found`
    });
  }
  
  res.status(200).json({
    success: true,
    message: `${type} deleted successfully`
  });
}));




// Updated financial report route - Using receipts as proof of payment
router.get("/report/:month/:year", asyncHandler(async (req, res) => {
  try {
    const { month, year } = req.params;
    const monthYear = `${month} ${year}`;
    const yearNum = parseInt(year);
    
    // Validate month and year
    const validMonths = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    
    if (!validMonths.includes(month)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid month. Must be full month name like 'January'" 
      });
    }

    if (isNaN(yearNum) || year.toString().length !== 4) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid year. Must be 4 digits like '2024'" 
      });
    }

    const monthIndex = validMonths.indexOf(month);

    // 1. Get financial records for the month
    const financialRecord = await FinancialRecords.findOne({ month: monthYear });
    
    // 2. Calculate expected fees from all active students
    const studentAnalysis = await calculateExpectedFees();
    
    // 3. Calculate actual fees collected from receipts
    const receiptAnalysis = calculateReceiptFees(financialRecord, monthIndex, yearNum);

    // 4. Calculate staff and tutor expenses (ONLY PAID)
    const staffExpenses = await calculateStaffExpenses(month, yearNum);
    const tutorExpenses = await calculateTutorExpenses(month, yearNum);

    // 5. Calculate financial document totals
    const documentTotals = calculateDocumentTotals(financialRecord);

    // 6. Compile comprehensive report
    const report = {
      period: monthYear,
      generatedAt: new Date(),
      summary: {
        totalRevenue: receiptAnalysis.totalCollected, // Only receipts are revenue
        totalExpenses: staffExpenses.total + tutorExpenses.total + 
                      documentTotals.invoiceAmount + documentTotals.billAmount,
        netProfit: receiptAnalysis.totalCollected - (staffExpenses.total + tutorExpenses.total + 
                  documentTotals.invoiceAmount + documentTotals.billAmount),
        netCashFlow: receiptAnalysis.totalCollected - (documentTotals.invoiceAmount + documentTotals.billAmount)
      },
      revenue: {
        studentFees: {
          expectedTotal: studentAnalysis.expectedTotal,
          totalCollected: receiptAnalysis.totalCollected,
          totalPending: studentAnalysis.expectedTotal - receiptAnalysis.totalCollected,
          studentCount: studentAnalysis.studentCount,
          collectionRate: studentAnalysis.expectedTotal > 0 ? 
            (receiptAnalysis.totalCollected / studentAnalysis.expectedTotal) * 100 : 0,
          details: receiptAnalysis.details
        }
      },
      expenses: {
        staff: {
          total: staffExpenses.total,
          totalSalaries: staffExpenses.totalSalaries,
          totalBonuses: staffExpenses.totalBonuses,
          staffCount: staffExpenses.staffCount,
          details: staffExpenses.details
        },
        tutors: {
          total: tutorExpenses.total,
          totalSalaries: tutorExpenses.totalSalaries,
          totalBonuses: tutorExpenses.totalBonuses,
          tutorCount: tutorExpenses.tutorCount,
          details: tutorExpenses.details
        },
        invoices: {
          total: documentTotals.invoiceAmount,
          count: documentTotals.invoices.count,
          paid: documentTotals.invoices.paid,
          pending: documentTotals.invoices.pending
        },
        bills: {
          total: documentTotals.billAmount,
          count: documentTotals.bills.count,
          paid: documentTotals.bills.paid,
          pending: documentTotals.bills.pending
        }
      },
      details: {
        studentAnalysis: studentAnalysis.details,
        receiptDetails: receiptAnalysis.details,
        staffDetails: staffExpenses.details,
        tutorDetails: tutorExpenses.details
      }
    };

    res.json({
      success: true,
      message: `Financial report for ${monthYear} generated successfully`,
      data: report
    });

  } catch (error) {
    console.error('Financial report error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
}));

// Calculate expected fees from all active students
const calculateExpectedFees = async () => {
  const students = await Student.find({});
  
  let expectedTotal = 0;
  const details = [];

  students.forEach(student => {
    const courseFee = student.courseFee || 0;
    expectedTotal += courseFee;

    details.push({
      studentName: `${student.firstName} ${student.lastName}`,
      admissionNumber: student.admissionNumber,
      course: student.courseName,
      expectedFee: courseFee,
      status: "active"
    });
  });

  return {
    expectedTotal,
    studentCount: students.length,
    details: details.slice(0, 20) // Limit for performance
  };
};

// Calculate actual fees collected from receipts in a specific month
const calculateReceiptFees = (financialRecord, monthIndex, year) => {
  if (!financialRecord || !financialRecord.receipts) {
    return {
      totalCollected: 0,
      receiptCount: 0,
      details: []
    };
  }

  let totalCollected = 0;
  const details = [];

  financialRecord.receipts.forEach(receipt => {
    const receiptDate = new Date(receipt.date);
    
    // Check if receipt is from the target month
    if (receiptDate.getMonth() === monthIndex && receiptDate.getFullYear() === year) {
      const amount = receipt.totalAmountDue || 0;
      totalCollected += amount;

      details.push({
        receiptNumber: receipt.receiptNumber,
        studentName: receipt.name,
        admissionNumber: receipt.admnNumber,
        course: receipt.courseEnrolled,
        amount: amount,
        date: receipt.date,
        remainingBalance: receipt.totalAmountRemaining || 0
      });
    }
  });

  return {
    totalCollected,
    receiptCount: details.length,
    details: details.slice(0, 20) // Limit for performance
  };
};

// Keep the same expense calculation functions (they're correct)
const calculateStaffExpenses = async (month, year) => {
  const staffMembers = await Staff.find({});
  
  let totalSalaries = 0;
  let totalBonuses = 0;
  const details = [];

  for (const staff of staffMembers) {
    const monthlySalary = staff.salaryPayments?.find(payment => 
      payment.month === month && payment.year === year && payment.status === "paid"
    );

    const monthlyBonuses = staff.bonuses?.filter(bonus => {
      const bonusDate = new Date(bonus.dateGiven || bonus.paidAt);
      return bonusDate.getMonth() === 
        ["January", "February", "March", "April", "May", "June",
         "July", "August", "September", "October", "November", "December"].indexOf(month) &&
             bonusDate.getFullYear() === year && bonus.status === "paid";
    }) || [];

    const salaryAmount = monthlySalary?.amount || 0;
    const bonusAmount = monthlyBonuses.reduce((sum, bonus) => sum + bonus.amount, 0);

    totalSalaries += salaryAmount;
    totalBonuses += bonusAmount;

    if (salaryAmount > 0 || bonusAmount > 0) {
      details.push({
        name: `${staff.firstName} ${staff.lastName}`,
        role: staff.role,
        salary: salaryAmount,
        bonuses: bonusAmount,
        total: salaryAmount + bonusAmount,
        status: monthlySalary?.status || "unpaid"
      });
    }
  }

  return {
    total: totalSalaries + totalBonuses,
    totalSalaries,
    totalBonuses,
    staffCount: details.length,
    details
  };
};

const calculateTutorExpenses = async (month, year) => {
  const tutors = await Tutor.find({});
  
  let totalSalaries = 0;
  let totalBonuses = 0;
  const details = [];

  for (const tutor of tutors) {
    const monthlySalary = tutor.salaryPayments?.find(payment => 
      payment.month === month && payment.year === year && payment.status === "paid"
    );

    const monthlyBonuses = tutor.bonuses?.filter(bonus => {
      const bonusDate = new Date(bonus.dateGiven || bonus.paidAt);
      return bonusDate.getMonth() === 
        ["January", "February", "March", "April", "May", "June",
         "July", "August", "September", "October", "November", "December"].indexOf(month) &&
             bonusDate.getFullYear() === year && bonus.status === "paid";
    }) || [];

    const salaryAmount = monthlySalary?.amount || 0;
    const bonusAmount = monthlyBonuses.reduce((sum, bonus) => sum + bonus.amount, 0);

    totalSalaries += salaryAmount;
    totalBonuses += bonusAmount;

    if (salaryAmount > 0 || bonusAmount > 0) {
      details.push({
        name: `${tutor.firstName} ${tutor.lastName}`,
        role: tutor.role,
        salary: salaryAmount,
        bonuses: bonusAmount,
        total: salaryAmount + bonusAmount,
        status: monthlySalary?.status || "unpaid"
      });
    }
  }

  return {
    total: totalSalaries + totalBonuses,
    totalSalaries,
    totalBonuses,
    tutorCount: details.length,
    details
  };
};

const calculateDocumentTotals = (financialRecord) => {
  if (!financialRecord) {
    return {
      invoiceAmount: 0,
      receiptAmount: 0,
      billAmount: 0,
      invoices: { count: 0, total: 0, paid: 0, pending: 0 },
      receipts: { count: 0, total: 0 },
      bills: { count: 0, total: 0, paid: 0, pending: 0 }
    };
  }

  const invoiceAmount = financialRecord.invoices.reduce((sum, invoice) => sum + invoice.totalAmountDue, 0);
  const receiptAmount = financialRecord.receipts.reduce((sum, receipt) => sum + receipt.totalAmountDue, 0);
  const billAmount = financialRecord.bills.reduce((sum, bill) => sum + bill.amount, 0);

  const paidInvoices = financialRecord.invoices.filter(inv => inv.paymentStatus === "Paid");
  const pendingInvoices = financialRecord.invoices.filter(inv => inv.paymentStatus === "Pending");
  
  const paidBills = financialRecord.bills.filter(bill => bill.status === "paid");
  const pendingBills = financialRecord.bills.filter(bill => bill.status === "pending");

  return {
    invoiceAmount,
    receiptAmount,
    billAmount,
    invoices: {
      count: financialRecord.invoices.length,
      total: invoiceAmount,
      paid: paidInvoices.length,
      pending: pendingInvoices.length
    },
    receipts: {
      count: financialRecord.receipts.length,
      total: receiptAmount
    },
    bills: {
      count: financialRecord.bills.length,
      total: billAmount,
      paid: paidBills.length,
      pending: pendingBills.length
    }
  };
};


module.exports = router;