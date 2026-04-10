const express = require('express');
const mongoose = require('mongoose');
const { connectBinaryDB } = require('../config/db');
const { getBinaryClientModel } = require('../models/BinaryClient');

const router = express.Router();
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid client ID format.' });
    }

    const connection = await connectBinaryDB();
    const BinaryClient = getBinaryClientModel(connection);
    const client = await BinaryClient.findById(id);

    if (!client) {
      return res.status(404).json({ status: 'error', message: 'Client not found.' });
    }

    return res.status(200).json({ status: 'success', data: client });
  } catch (error) {
    console.error('Single client fetch error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve client.' });
  }
});

router.patch('/:id/contact', async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid client ID format.' });
    }

    const { phone, email, secondaryEmail, secondaryPhone, website } = req.body;
    const contactUpdate = {};

    if (phone !== undefined) contactUpdate['contact.phone'] = String(phone).trim();
    if (email !== undefined) contactUpdate['contact.email'] = String(email).trim().toLowerCase();
    if (secondaryEmail !== undefined) contactUpdate['contact.secondaryEmail'] = String(secondaryEmail).trim().toLowerCase();
    if (secondaryPhone !== undefined) contactUpdate['contact.secondaryPhone'] = String(secondaryPhone).trim();
    if (website !== undefined) contactUpdate['contact.website'] = String(website).trim();

    if (Object.keys(contactUpdate).length === 0) {
      return res.status(400).json({ status: 'error', message: 'No contact fields provided.' });
    }

    const connection = await connectBinaryDB();
    const BinaryClient = getBinaryClientModel(connection);
    const updated = await BinaryClient.findByIdAndUpdate(id, { $set: contactUpdate }, { new: true, runValidators: true });

    if (!updated) {
      return res.status(404).json({ status: 'error', message: 'Client not found.' });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Contact info updated.',
      data: updated.contact
    });
  } catch (error) {
    console.error('Update contact error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update contact info.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.all('/:id/paymentProfiles', async (req, res) => {
  return res.status(410).json({
    status: 'disabled',
    message: 'Saved payment profiles are no longer stored. Clients now choose their payment method directly on the Pesapal checkout page.'
  });
});

module.exports = router;
