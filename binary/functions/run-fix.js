require('dotenv').config();

const mongoose = require('mongoose');

const { connectBinaryDB } = require('../config/db');
const { getBinaryClientModel } = require('../models/BinaryClient');

const run = async () => {
  try {
    console.log('🚀 Starting one-time billing fix...');

    // Connect to Binary DB
    const connection = await connectBinaryDB();
    const Client = getBinaryClientModel(connection);

    // 🔥 HARDCODED VALUES (your case)
    const clientId = "69f4dd743a89c3cf9f7e30d1";
    const serviceId = "69f4dd743a89c3cf9f7e30d2";

    const months = ["01", "02", "03", "04"];
    const year = 2026;

    // ✅ RUN UPDATE
    const result = await Client.updateOne(
      { _id: new mongoose.Types.ObjectId(clientId) },
      {
        $set: {
          "services.$[service].paymentHistory": [],
          "services.$[service].invoices.$[invoice].status": "paid",
          "services.$[service].invoices.$[invoice].paidYears": [year],
          "services.$[service].invoices.$[invoice].emailSent": true,
          "services.$[service].invoices.$[invoice].smsSent": true
        }
      },
      {
        arrayFilters: [
          { "service._id": new mongoose.Types.ObjectId(serviceId) },
          { "invoice.period": { $in: months } }
        ]
      }
    );

    console.log('✅ Update complete');
    console.log('Matched:', result.matchedCount);
    console.log('Modified:', result.modifiedCount);

    // 🔍 OPTIONAL: FETCH UPDATED DOC TO VERIFY
    const updatedClient = await Client.findById(clientId).lean();

    console.log('🧾 Updated invoices (Jan–Apr):');
    const service = updatedClient.services.find(
      s => s._id.toString() === serviceId
    );

    const filteredInvoices = service.invoices.filter(i =>
      months.includes(i.period)
    );

    console.dir(filteredInvoices, { depth: null });

  } catch (error) {
    console.error('❌ Error running fix:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected');
    process.exit(0);
  }
};

run();