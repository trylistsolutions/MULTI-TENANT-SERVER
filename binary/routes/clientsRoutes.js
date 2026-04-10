const express = require('express');
const mongoose = require('mongoose');
const { connectBinaryDB } = require('../config/db');
const { getBinaryClientModel } = require('../models/BinaryClient');
const { addInvoicesToService } = require('../services/invoiceService');

const router = express.Router();

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

router.post('/', async (req, res) => {
  try {
    const connection = await connectBinaryDB();
    const BinaryClient = getBinaryClientModel(connection);
    const payload = { ...req.body };

    if (!payload?.clientName || !payload?.contact?.phone || !payload?.contact?.email) {
      return res.status(400).json({
        status: 'error',
        message: 'Required fields: clientName, contact.phone, contact.email.'
      });
    }

    delete payload.paymentProfiles;
    delete payload.paymentMethod;

    const client = await BinaryClient.create(payload);

    // Generate invoices for subscription services
    if (client.services && client.services.length > 0) {
      for (const service of client.services) {
        if (service.paymentType === 'subscription') {
          await addInvoicesToService(client._id, service._id, service);
        }
      }
    }

    return res.status(201).json({
      status: 'success',
      message: 'Client created successfully.',
      data: client
    });
  } catch (error) {
    console.error('Create Binary client error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to create client.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.get('/', async (req, res) => {
  try {
    const connection = await connectBinaryDB();
    const BinaryClient = getBinaryClientModel(connection);

    const {
      search = '',
      accountStatus,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { clientName: { $regex: search, $options: 'i' } },
        { businessName: { $regex: search, $options: 'i' } },
        { 'contact.email': { $regex: search, $options: 'i' } },
        { 'contact.phone': { $regex: search, $options: 'i' } }
      ];
    }

    if (accountStatus) {
      query.accountStatus = accountStatus;
    }

    const currentPage = Math.max(parseInt(page, 10) || 1, 1);
    const perPage = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);

    const allowedSortFields = ['createdAt', 'updatedAt', 'clientName', 'accountStatus', 'totalLifetimeValue'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const safeSortOrder = sortOrder === 'asc' ? 1 : -1;

    const [clients, total] = await Promise.all([
      BinaryClient.find(query)
        .sort({ [safeSortBy]: safeSortOrder })
        .skip((currentPage - 1) * perPage)
        .limit(perPage),
      BinaryClient.countDocuments(query)
    ]);

    return res.status(200).json({
      status: 'success',
      data: clients,
      pagination: {
        total,
        page: currentPage,
        limit: perPage,
        pages: Math.ceil(total / perPage)
      }
    });
  } catch (error) {
    console.error('Get Binary clients error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve clients.'
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid client ID format.'
      });
    }

    const connection = await connectBinaryDB();
    const BinaryClient = getBinaryClientModel(connection);
    const client = await BinaryClient.findById(id);

    if (!client) {
      return res.status(404).json({
        status: 'error',
        message: 'Client not found.'
      });
    }

    return res.status(200).json({
      status: 'success',
      data: client
    });
  } catch (error) {
    console.error('Get Binary client by id error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve client.'
    });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid client ID format.'
      });
    }

    const updateData = { ...req.body };
    delete updateData._id;
    delete updateData.createdAt;
    delete updateData.paymentProfiles;
    delete updateData.paymentMethod;

    console.log(`[PATCH CLIENT] Starting update for client: ${id}`);
    console.log(`[PATCH CLIENT] Update data:`, JSON.stringify(updateData, null, 2));

    const connection = await connectBinaryDB();
    const BinaryClient = getBinaryClientModel(connection);

    // If updating services, merge with existing services to preserve invoices
    if (updateData.services && Array.isArray(updateData.services)) {
      console.log(`[PATCH CLIENT] Services found in update data. Count: ${updateData.services.length}`);
      const existingClient = await BinaryClient.findById(id);
      if (existingClient) {
        console.log(`[PATCH CLIENT] Existing client found. Current services count: ${existingClient.services.length}`);
        
        const mergedServices = updateData.services.map((updatedService, serviceIndex) => {
          console.log(`[PATCH CLIENT] Processing service ${serviceIndex + 1}: ${updatedService.serviceName}`);
          
          // Find existing service by _id first, then by serviceName as fallback
          const existingService = existingClient.services.find((existing) => {
            if (updatedService._id && existing._id) {
              return existing._id.toString() === updatedService._id;
            }
            // Fallback to name matching if no _id (shouldn't happen with proper frontend)
            return existing.serviceName === updatedService.serviceName;
          });

          if (existingService) {
            console.log(`[PATCH CLIENT] Existing service found: ${existingService.serviceName}`);
            console.log(`[PATCH CLIENT] Old monthlyCost: ${existingService.monthlyCost}, New monthlyCost: ${updatedService.monthlyCost}`);
            console.log(`[PATCH CLIENT] Old setupCost: ${existingService.setupCost}, New setupCost: ${updatedService.setupCost}`);
            
            // Check if cost changed
            const monthlyCostChanged = updatedService.monthlyCost !== undefined && 
                                       updatedService.monthlyCost !== existingService.monthlyCost;
            const setupCostChanged = updatedService.setupCost !== undefined && 
                                     updatedService.setupCost !== existingService.setupCost;

            console.log(`[PATCH CLIENT] Monthly cost changed: ${monthlyCostChanged}`);
            console.log(`[PATCH CLIENT] Setup cost changed: ${setupCostChanged}`);

            // If cost changed, update unpaid invoices
            let updatedInvoices = existingService.invoices;
            if (monthlyCostChanged || setupCostChanged) {
              const currentYear = new Date().getFullYear();
              const newAmount = updatedService.monthlyCost !== undefined 
                ? updatedService.monthlyCost 
                : updatedService.setupCost !== undefined 
                ? updatedService.setupCost 
                : undefined;
              
              console.log(`[PATCH] Service "${existingService.serviceName}" - Cost change: ${existingService.monthlyCost}→${updatedService.monthlyCost}`);
              console.log(`[PATCH] Before update - Invoice #1 (${existingService.invoices[0]?.period}): amount=${existingService.invoices[0]?.amount}`);
              
              // Mutate invoices directly for Mongoose to track changes
              updatedInvoices = (existingService.invoices || []).map((invoice) => {
                const isPaid = invoice.paidYears && invoice.paidYears.includes(currentYear);
                if (!isPaid) {
                  // Direct mutation on subdocument so Mongoose tracks it
                  invoice.amount = newAmount;
                }
                return invoice;
              });
              
              console.log(`[PATCH] After update - Invoice #1 (${updatedInvoices[0]?.period}): amount=${updatedInvoices[0]?.amount}`);
            }

            // Merge updated fields with existing service, preserving updated invoices and paymentHistory
            return {
              ...existingService.toObject(),
              ...updatedService,
              invoices: updatedInvoices,
              paymentHistory: existingService.paymentHistory
            };
          } else {
            // New service, return as is
            console.log(`[PATCH CLIENT] New service being added: ${updatedService.serviceName}`);
            return updatedService;
          }
        });
        updateData.services = mergedServices;
        console.log(`[PATCH] Service merge complete. Ready to save to database.`);
      }
    }

    const updatedClient = await BinaryClient.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true
    });

    console.log(`[PATCH] Mongoose update completed for client: ${id}`);
    if (updatedClient) {
      updatedClient.services.forEach(s => {
        console.log(`[PATCH] Saved - Service "${s.serviceName}" monthlyCost=${s.monthlyCost}, Invoice #1 amount=${s.invoices[0]?.amount}`);
      });
    }

    if (!updatedClient) {
      return res.status(404).json({
        status: 'error',
        message: 'Client not found.'
      });
    }

    // Generate invoices for subscription services (only for newly added services)
    if (updatedClient.services && updatedClient.services.length > 0) {
      for (const service of updatedClient.services) {
        if (service.paymentType === 'subscription' && (!service.invoices || service.invoices.length === 0)) {
          await addInvoicesToService(updatedClient._id, service._id, service);
        }
      }
    }

    return res.status(200).json({
      status: 'success',
      message: 'Client updated successfully.',
      data: updatedClient
    });
  } catch (error) {
    console.error('Update Binary client error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update client.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid client ID format.'
      });
    }

    const connection = await connectBinaryDB();
    const BinaryClient = getBinaryClientModel(connection);

    const deletedClient = await BinaryClient.findByIdAndDelete(id);

    if (!deletedClient) {
      return res.status(404).json({
        status: 'error',
        message: 'Client not found.'
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Client deleted successfully.'
    });
  } catch (error) {
    console.error('Delete Binary client error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to delete client.'
    });
  }
});

module.exports = router;
