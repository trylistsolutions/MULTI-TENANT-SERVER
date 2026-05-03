require('dotenv').config({
    path: require('path').join(__dirname, '../../.env')
});
const mongoose = require('mongoose');
const { connectAlchemystDB } = require('../config/db');
const rawData = require('../data/profiles');

const getModel = (userType, models) => {
  switch ((userType || '').toLowerCase()) {
    case 'escort':
      return models.Escort;
    case 'masseuse':
      return models.Masseuse;
    case 'ofmodel':
      return models.OFModel;
    case 'spa':
      return models.Spa;
    default:
      return null;
  }
};

const convertDates = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;

  for (const key in obj) {
    const value = obj[key];

    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
      obj[key] = new Date(value);
    } else if (typeof value === 'object') {
      convertDates(value);
    }
  }

  return obj;
};

const convertObjectIds = (doc) => {
  if (doc._id && typeof doc._id === 'string') {
    try {
      doc._id = new mongoose.Types.ObjectId(doc._id);
    } catch {}
  }
  return doc;
};

const sanitizeProfile = (doc) => {
  delete doc.__v;
  return doc;
};

const run = async () => {
  // ✅ CONNECT FIRST
  await connectAlchemystDB();

  // ✅ NOW require models (after connection exists)
  const Escort = require('../models/Escort');
  const Masseuse = require('../models/Masseuse');
  const OFModel = require('../models/OFModel');
  const Spa = require('../models/Spa');

  const models = { Escort, Masseuse, OFModel, Spa };

  const profiles = rawData.profiles.allProfiles;

  console.log(`\n🚀 Starting recovery for ${profiles.length} profiles...\n`);

  const stats = {
    inserted: 0,
    failed: 0,
    skipped: 0
  };

  for (const original of profiles) {
    try {
      let doc = JSON.parse(JSON.stringify(original));

      doc = sanitizeProfile(doc);
      doc = convertDates(doc);
      doc = convertObjectIds(doc);

      const Model = getModel(doc.userType, models);

      if (!Model) {
        console.log(`⚠️ Skipped (unknown type): ${doc.userType}`);
        stats.skipped++;
        continue;
      }

      await Model.create(doc);

      console.log(`✅ ${doc.username} (${doc.userType})`);
      stats.inserted++;

    } catch (err) {
      console.error(`❌ Failed: ${original.username}`, err.message);
      stats.failed++;
    }
  }

  console.log('\n📊 SUMMARY');
  console.log('----------------------');
  console.log(`Inserted: ${stats.inserted}`);
  console.log(`Failed:   ${stats.failed}`);
  console.log(`Skipped:  ${stats.skipped}`);
  console.log('----------------------\n');

  process.exit();
};

run();