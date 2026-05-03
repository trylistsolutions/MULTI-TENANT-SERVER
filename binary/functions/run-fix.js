require('dotenv').config();

const mongoose = require('mongoose');

const { connectBinaryDB } = require('../config/db');
const { getBinaryClientModel } = require('../models/BinaryClient');

const run = async () => {
  try {
    console.log('🚀 Starting Zoezi billing fix...');

    const connection = await connectBinaryDB();
    const Client = getBinaryClientModel(connection);

    const clientId = "69f4fd5b0de47e081676d55e";

    const months = ["01", "02", "03", "04"];
    const year = 2026;

    // 🔥 SERVICE IDS
    const monthlyServiceId = "69f4fd5b0de47e081676d55f";
    const zoeziYearlyServiceId = "69f50fc7f6731ceb23363d8f";
    const goldchildYearlyServiceId = "69f51014f6731ceb23363e0a";

    // =========================
    // 1. MONTHLY SERVICE UPDATE
    // =========================
    const monthlyResult = await Client.updateOne(
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
          { "service._id": new mongoose.Types.ObjectId(monthlyServiceId) },
          { "invoice.period": { $in: months } }
        ]
      }
    );

    // =========================
    // 2. ZOEZI YEARLY SERVICE
    // =========================
    const zoeziYearlyResult = await Client.updateOne(
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
          { "service._id": new mongoose.Types.ObjectId(zoeziYearlyServiceId) },
          { "invoice.period": "2026" }
        ]
      }
    );

    // =========================
    // 3. GOLDCHILD YEARLY SERVICE
    // =========================
    const goldchildYearlyResult = await Client.updateOne(
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
          { "service._id": new mongoose.Types.ObjectId(goldchildYearlyServiceId) },
          { "invoice.period": "2026" }
        ]
      }
    );

    console.log('✅ DONE');

    console.log('Monthly:', monthlyResult.modifiedCount);
    console.log('Zoezi Yearly:', zoeziYearlyResult.modifiedCount);
    console.log('Goldchild Yearly:', goldchildYearlyResult.modifiedCount);

    // 🔍 VERIFY
    const updatedClient = await Client.findById(clientId).lean();

    console.log('\n🧾 CHECK RESULTS:\n');

    updatedClient.services.forEach(service => {
      if (
        service._id.toString() === monthlyServiceId ||
        service._id.toString() === zoeziYearlyServiceId ||
        service._id.toString() === goldchildYearlyServiceId
      ) {
        console.log(`\nService: ${service.serviceName}`);

        const filtered = service.invoices.filter(i =>
          months.includes(i.period) || i.period === "2026"
        );

        console.dir(filtered, { depth: null });
      }
    });

  } catch (error) {
    console.error('❌ Error running fix:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected');
    process.exit(0);
  }
};

run();