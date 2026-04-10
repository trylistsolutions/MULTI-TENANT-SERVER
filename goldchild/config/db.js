const mongoose = require('mongoose');

let goldchildConnection = null;
let goldchildConnectionPromise = null;

const connectGoldchildDB = async () => {
  if (goldchildConnection?.readyState === 1) {
    return goldchildConnection;
  }

  if (goldchildConnectionPromise) {
    return goldchildConnectionPromise;
  }

  const mongoUri = process.env.GOLDCHILD_MONGODB_URI || process.env.MONGODB_URI;
  const configuredDbName = process.env.GOLDCHILD_DB_NAME || 'goldchild';
  const dbName = configuredDbName.toLowerCase();

  if (configuredDbName !== dbName) {
    console.warn(`Goldchild DB name normalized from "${configuredDbName}" to "${dbName}" to avoid MongoDB case-conflict.`);
  }

  if (!mongoUri) {
    throw new Error('Missing MongoDB URI for Goldchild. Set GOLDCHILD_MONGODB_URI or MONGODB_URI.');
  }

  goldchildConnectionPromise = mongoose
    .createConnection(mongoUri, {
      dbName,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000
    })
    .asPromise()
    .then((connection) => {
      goldchildConnection = connection;
      console.log(`🧯 Goldchild MongoDB Connected`);
      return connection;
    })
    .catch((error) => {
      goldchildConnectionPromise = null;
      console.error(`Goldchild DB connection failed: ${error.message}`);
      throw error;
    });

  return goldchildConnectionPromise;
};

module.exports = {
  connectGoldchildDB
};
