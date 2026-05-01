const mongoose = require('mongoose');

let binaryConnection = null;
let binaryConnectionPromise = null;

const connectBinaryDB = async () => {
  if (binaryConnection?.readyState === 1) {
    return binaryConnection;
  }

  if (binaryConnectionPromise) {
    return binaryConnectionPromise;
  }

  const mongoUri = process.env.BINARY_MONGODB_URI;
  const configuredDbName = process.env.BINARY_DB_NAME;
  const dbName = configuredDbName.toLowerCase();

  if (configuredDbName !== dbName) {
    console.warn(`Binary DB name normalized from "${configuredDbName}" to "${dbName}" to avoid MongoDB case-conflict.`);
  }

  if (!mongoUri) {
    throw new Error('Missing MongoDB URI for Binary. Set BINARY_MONGODB_URI or MONGODB_URI.');
  }

  binaryConnectionPromise = mongoose
    .createConnection(mongoUri, {
      dbName,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000
    })
    .asPromise()
    .then((connection) => {
      binaryConnection = connection;
      console.log(`🔌 Binary MongoDB Connected`);
      return connection;
    })
    .catch((error) => {
      binaryConnectionPromise = null;
      console.error(`Binary DB connection failed: ${error.message}`);
      throw error;
    });

  return binaryConnectionPromise;
};

module.exports = {
  connectBinaryDB
};
