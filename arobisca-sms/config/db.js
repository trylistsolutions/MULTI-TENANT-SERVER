const mongoose = require('mongoose');

let arobiscaSmsConnection = null;
let arobiscaSmsConnectionPromise = null;

const connectArobiscaSmsDB = async () => {
  if (arobiscaSmsConnection?.readyState === 1) {
    return arobiscaSmsConnection;
  }

  if (arobiscaSmsConnectionPromise) {
    return arobiscaSmsConnectionPromise;
  }

  const mongoUri = process.env.AROBISCA_SMS_MONGODB_URI;
  const configuredDbName = process.env.AROBISCA_SMS_DB_NAME || 'arobisca';
  const dbName = configuredDbName.toLowerCase();

  if (configuredDbName !== dbName) {
    console.warn(`Arobisca SMS DB name normalized from "${configuredDbName}" to "${dbName}" to avoid MongoDB case-conflict.`);
  }

  if (!mongoUri) {
    throw new Error('Missing MongoDB URI for Arobisca SMS. Set AROBISCA_SMS_MONGODB_URI in the root .env file.');
  }

  arobiscaSmsConnectionPromise = mongoose
    .createConnection(mongoUri, {
      dbName,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000
    })
    .asPromise()
    .then((conn) => {
      arobiscaSmsConnection = conn;
      arobiscaSmsConnectionPromise = null;
      console.log('📲 [Arobisca SMS] MongoDB connected');
      return conn;
    })
    .catch((err) => {
      arobiscaSmsConnectionPromise = null;
      throw err;
    });

  return arobiscaSmsConnectionPromise;
};

const getArobiscaSmsDB = () => {
  if (!arobiscaSmsConnection || arobiscaSmsConnection.readyState !== 1) {
    throw new Error('[Arobisca SMS] Database not connected yet. Ensure connectArobiscaSmsDB() was called at startup.');
  }
  return arobiscaSmsConnection;
};

module.exports = { connectArobiscaSmsDB, getArobiscaSmsDB };
