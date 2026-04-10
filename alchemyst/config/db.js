const mongoose = require('mongoose');

let alchemystConnection = null;
let alchemystConnectionPromise = null;

const connectAlchemystDB = async () => {
  if (alchemystConnection?.readyState === 1) {
    return alchemystConnection;
  }

  if (alchemystConnectionPromise) {
    return alchemystConnectionPromise;
  }

  const mongoUri = process.env.ALCHEMYST_MONGODB_URI;
  const configuredDbName = process.env.ALCHEMYST_DB_NAME || 'ALCHEMYST';
  const dbName = configuredDbName.toLowerCase();

  if (configuredDbName !== dbName) {
    console.warn(`Alchemyst DB name normalized from "${configuredDbName}" to "${dbName}" to avoid MongoDB case-conflict.`);
  }

  if (!mongoUri) {
    throw new Error('Missing MongoDB URI for Alchemyst. Set ALCHEMYST_MONGODB_URI in the root .env file.');
  }

  alchemystConnectionPromise = mongoose
    .createConnection(mongoUri, {
      dbName,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000
    })
    .asPromise()
    .then((conn) => {
      alchemystConnection = conn;
      alchemystConnectionPromise = null;
      console.log('✅ [Alchemyst] MongoDB connected');
      return conn;
    })
    .catch((err) => {
      alchemystConnectionPromise = null;
      throw err;
    });

  return alchemystConnectionPromise;
};

const getAlchemystDB = () => {
  if (!alchemystConnection || alchemystConnection.readyState !== 1) {
    throw new Error('[Alchemyst] Database not connected yet. Ensure connectAlchemystDB() was called at startup.');
  }
  return alchemystConnection;
};

module.exports = { connectAlchemystDB, getAlchemystDB };
