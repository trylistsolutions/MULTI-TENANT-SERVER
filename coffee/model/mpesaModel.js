const mongoose = require('mongoose');
const { getCoffeeDB } = require('../config/db');

const coffeeConnection = getCoffeeDB();
const coffeeModel = (name, schema, collection) => {
  if (!schema) {
    return coffeeConnection.model(name);
  }

  return coffeeConnection.models[name] || coffeeConnection.model(name, schema, collection);
};
const { Schema } = mongoose;

const paymentSchema = new Schema(
    {
        phone: {
            type: String,
            required: true,
        },
        transactionId: {
            type: String,
            required: true,
            unique: true, 
        },
        amount: {
            type: Number,
            required: true,
        }
    },
    {
        timestamps: true
    }
);

const MpesaTransaction = coffeeModel("MpesaTransaction", paymentSchema);

module.exports = MpesaTransaction;
