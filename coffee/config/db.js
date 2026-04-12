const mongoose = require('mongoose');

let coffeeConnection = null;
let coffeeConnectionPromise = null;

const connectCoffeeDB = async () => {
  if (coffeeConnection?.readyState === 1) {
    return coffeeConnection;
  }

  if (coffeeConnectionPromise) {
    return coffeeConnectionPromise;
  }

  const mongoUri = process.env.COFFEE_MONGODB_URI;
  const configuredDbName = process.env.COFFEE_DB_NAME;
  const dbName = configuredDbName;

  if (configuredDbName !== dbName) {
    console.warn(`Coffee DB name normalized from "${configuredDbName}" to "${dbName}" to avoid MongoDB case-conflict.`);
  }

  if (!mongoUri) {
    throw new Error('Missing MongoDB URI for Coffee. Set COFFEE_MONGODB_URI in the root .env file.');
  }

  coffeeConnectionPromise = mongoose
    .createConnection(mongoUri, {
      dbName,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000
    })
    .asPromise()
    .then((conn) => {
      coffeeConnection = conn;
      coffeeConnectionPromise = null;
      console.log('☕ [Coffee] MongoDB connected');
      return conn;
    })
    .catch((err) => {
      coffeeConnectionPromise = null;
      throw err;
    });

  return coffeeConnectionPromise;
};

const getCoffeeDB = () => {
  if (!coffeeConnection || coffeeConnection.readyState !== 1) {
    throw new Error('[Coffee] Database not connected yet. Ensure connectCoffeeDB() was called at startup.');
  }
  return coffeeConnection;
};

module.exports = { connectCoffeeDB, getCoffeeDB };
