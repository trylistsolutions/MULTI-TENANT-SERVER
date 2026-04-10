const express = require("express");
const asyncHandler = require("express-async-handler");
const Payment = require("../models/Mpesa");
const axios = require("axios");
const router = express.Router();
const { clients } = require('../sockets/websocketState');
const { authenticateToken } = require('../middleware/authMiddleware');
const Escort = require('../models/Escort');
const Masseuse = require('../models/Masseuse');
const OFModel = require('../models/OFModel');
const Spa = require('../models/Spa');

const getModelByType = (userType) => {
  switch (userType) {
    case 'escort':
      return Escort;
    case 'masseuse':
      return Masseuse;
    case 'of-model':
      return OFModel;
    case 'spa':
      return Spa;
    default:
      return null;
  }
};

// Middleware to generate token
const generateToken = async (req, res, next) => {
    const secretKey = process.env.ALCHEMYST_MPESA_CONSUMER_SECRET;
    const consumerKey = process.env.ALCHEMYST_MPESA_CONSUMER_KEY;
    const auth = Buffer.from(`${consumerKey}:${secretKey}`).toString("base64");

    const environmentAuthUrl = process.env.ALCHEMYST_MPESA_AUTH_URL;
    const authUrl = `${environmentAuthUrl}?grant_type=client_credentials`;

    try {
        const response = await axios.get(authUrl, {
            headers: {
                Authorization: `Basic ${auth}`,
            },
        });
        req.token = response.data.access_token;
        next();
    } catch (err) {
        console.error("Error generating token:", err.message);
        res
            .status(400)
            .json({ error: "Failed to generate token", details: err.message });
    }
};

// Send STK Push Request
router.post("/stk", generateToken, asyncHandler(async (req, res) => {
    const { phone, amount } = req.body;
    const formattedPhone = phone.substring(1);

    const passkey = process.env.ALCHEMYST_MPESA_PASSKEY;
    const shortcode = process.env.ALCHEMYST_MPESA_SHORTCODE;
    const reqUrl = process.env.ALCHEMYST_MPESA_STK_PUSH_URL;
    const callbackURL = process.env.ALCHEMYST_MPESA_CALLBACK_URL;

    const date = new Date();
    const timestamp =
        date.getFullYear() +
        ("0" + (date.getMonth() + 1)).slice(-2) +
        ("0" + date.getDate()).slice(-2) +
        ("0" + date.getHours()).slice(-2) +
        ("0" + date.getMinutes()).slice(-2) +
        ("0" + date.getSeconds()).slice(-2);

    const password = new Buffer.from(shortcode + passkey + timestamp).toString(
        "base64"
    );

    const reqBody = {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerBuyGoodsOnline",
        Amount: amount,
        PartyA: `254${formattedPhone}`,
        PartyB: process.env.ALCHEMYST_MPESA_TILLNUMBER,
        PhoneNumber: `254${formattedPhone}`,
        CallBackURL: callbackURL,
        AccountReference: "TRYLIST SOLUTIONS",
        TransactionDesc: "Test",
    }

    try {
        const response = await axios.post(reqUrl, reqBody,
            {
                headers: {
                    Authorization: `Bearer ${req.token}`,
                },
            },
        );

        // Return the unique identifiers with the response
        res.status(200).json(response.data);
    } catch (err) {
        console.error("STK push error:", err.message);
        res
            .status(400)
            .json({ error: "Failed to initiate STK push", details: err.message });
    }
})
);

// Results posted on callback
router.post("/resultcghbnsjsxhHJSM", (req, res) => {
    const callbackData = req.body;
    const stkCallback = callbackData.Body.stkCallback;
    const resultCode = stkCallback.ResultCode;

    const checkoutRequestId = stkCallback.CheckoutRequestID;

    let message = { status: "unknown" };

    if (resultCode === 0) {
        console.log("Payment successful - preparing to broadcast");

        const metadata = stkCallback.CallbackMetadata.Item;
        console.log('metadata', metadata)
        const transactionData = {
            phone: metadata.find((item) => item.Name === "PhoneNumber")?.Value,
            amount: metadata.find((item) => item.Name === "Amount")?.Value,
            transactionId: metadata.find((item) => item.Name === "MpesaReceiptNumber")?.Value,
        };

        message = {
            status: "success",
            data: transactionData,
        };

        // Save payment to the database
        const payment = new Payment(transactionData);
        payment
            .save()
            .then(() => console.log("Payment saved successfully"))
            .catch((err) => console.error("Error saving payment:", err.message));

    } else if (resultCode === 1) {
        console.log("Balance is insufficient for the transaction. Please top up and try again.", stkCallback);
        message = { status: "insufficient", message: "Balance is insufficient for the transaction. Please top up and try again." };
    } else if (resultCode === 1032) {
        console.log("Request cancelled by user", stkCallback);
        message = { status: "cancelled", message: "Request cancelled by user" };
    } else if (resultCode === 2001) {
        console.log("The initiator information is invalid", stkCallback);
        message = { status: "failed", message: "The initiator information is invalid. Please check your PIN and try again" };
    } else if (resultCode === 1037) {
        console.log("DS timeout user cannot be reached", stkCallback);
        message = { status: "timedout", message: "DS Timeout. Please initiate again and respond Quicker" };
    }

    console.log("Broadcasting message:", { checkoutRequestId, ...message });

    // Broadcast the result to the specific client using the CheckoutReques tID
    const client = clients.get(checkoutRequestId); // Get the WebSocket client by CheckoutRequestID
    if (client && client.readyState === client.OPEN) {
        client.send(JSON.stringify({ ...message }));
        console.log(`Message sent to client with CheckoutRequestID: ${checkoutRequestId}`);
    }

    res.json("ok");
});

router.post("/paymentStatus", generateToken, asyncHandler(async (req, res) => {
    const { CheckoutRequestId } = req.body;

    const passkey = process.env.ALCHEMYST_MPESA_PASSKEY;
    const shortcode = process.env.ALCHEMYST_MPESA_SHORTCODE;

    const date = new Date();
    const timestamp =
        date.getFullYear() +
        ("0" + (date.getMonth() + 1)).slice(-2) +
        ("0" + date.getDate()).slice(-2) +
        ("0" + date.getHours()).slice(-2) +
        ("0" + date.getMinutes()).slice(-2) +
        ("0" + date.getSeconds()).slice(-2);


    const password = new Buffer.from(shortcode + passkey + timestamp).toString(
        "base64"
    );

    const requestBody = {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: CheckoutRequestId,
    };

    const statusCheckURL = process.env.ALCHEMYST_MPESA_STATUS_CHECK_URL;


    try {
        const response = await axios.post(statusCheckURL, requestBody,
            {
                headers: {
                    Authorization: `Bearer ${req.token}`,
                    "Content-Type": "application/json",
                },
            }
        )

        const resultCode = parseInt(response.data.ResultCode, 10);

        let message = { status: "unknown" };

        if (resultCode === 0) {
            console.log("Payment was successful - preparing to broadcast");
            message = { status: "success", message: "Payment was successful", };
        } else if (resultCode === 1) {
            console.log("Balance is insufficient for the transaction. Please top up and try again.", stkCallback);
            message = { status: "insufficient", message: "Balance is insufficient for the transaction. Please top up and try again." };
        } else if (resultCode === 1032) {
            console.log("Request was cancelled by user");
            message = { status: "cancelled", message: "Request cancelled by user" };
        } else if (resultCode === 2001) {
            console.log("The initiator information was invalid. Please check your PIN and try again");
            message = { status: "failed", message: "The initiator information was invalid. Please check your PIN and try again" };
        } else if (resultCode === 1037) {
            console.log("DS timeout user was not reached");
            message = { status: "timedout", message: "DS timeout user cannot be reached" };
        }

        console.log("Broadcasting message:", { CheckoutRequestId, ...message });

        const client = clients.get(CheckoutRequestId);

        if (client && client.readyState === client.OPEN) {
            client.send(JSON.stringify({ ...message }));
            console.log(`Message sent to client with CheckoutRequestID: ${CheckoutRequestId}`);
        }

        res.status(200).json(response.data);
    } catch (err) {
        console.error("Status check error:", err.message);
        res.status(400).json({ error: "Failed to check Payment status", details: err.message });
    }

}))

// Update wallet balance endpoint
router.post('/update-balance', authenticateToken, asyncHandler(async (req, res) => {
  const { amount, transactionId, checkoutRequestId, phone } = req.body;

  // Validate required fields
  if (!amount || !transactionId) {
    return res.status(400).json({
      success: false,
      message: 'Amount and transaction ID are required'
    });
  }

  const user = req.user;
  const userType = req.userType;
  const Model = getModelByType(userType);

  if (!Model) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user type'
    });
  }

  try {
    // Check if transaction was already processed to prevent duplicates
    const existingUser = await Model.findById(user._id);
    if (existingUser.processedTransactions.includes(transactionId)) {
      return res.status(409).json({
        success: false,
        message: 'Transaction already processed'
      });
    }

    // Update user wallet balance (ADD to existing balance, don't set)
    const updatedUser = await Model.findByIdAndUpdate(
      user._id,
      {
        $inc: { 'wallet.balance': amount }, // Add to existing balance
        $push: {
          paymentHistory: {
            transactionId,
            checkoutRequestId,
            amount,
            phone,
            type: 'deposit',
            status: 'completed',
            description: 'M-Pesa deposit'
          },
          processedTransactions: transactionId
        }
      },
      { new: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'Wallet updated successfully',
      data: {
        newBalance: updatedUser.wallet.balance,
        transactionId: transactionId,
        amountAdded: amount
      }
    });

  } catch (error) {
    console.error('Error updating wallet balance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update wallet balance'
    });
  }
}));

// Get wallet balance
router.get('/wallet/balance', authenticateToken, asyncHandler(async (req, res) => {
  const user = req.user;
  const userType = req.userType;
  const Model = getModelByType(userType);

  if (!Model) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user type'
    });
  }

  const userData = await Model.findById(user._id).select('wallet paymentHistory');
  
  res.json({
    success: true,
    data: {
      balance: userData.wallet.balance,
      currency: userData.wallet.currency,
      paymentHistory: userData.paymentHistory
    }
  });
}));

// Get payment history
router.get('/wallet/history', authenticateToken, asyncHandler(async (req, res) => {
  const user = req.user;
  const userType = req.userType;
  const Model = getModelByType(userType);

  if (!Model) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user type'
    });
  }

  const userData = await Model.findById(user._id).select('paymentHistory');
  
  // Sort by most recent first
  const sortedHistory = userData.paymentHistory.sort((a, b) => 
    new Date(b.timestamp) - new Date(a.timestamp)
  );

  res.json({
    success: true,
    data: {
      paymentHistory: sortedHistory,
      totalTransactions: sortedHistory.length
    }
  });
}));

module.exports = router;
