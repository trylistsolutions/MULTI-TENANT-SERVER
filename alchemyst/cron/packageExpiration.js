const cron = require('node-cron');
const axios = require('axios');

// Run every day at 2:00 AM
cron.schedule('0 2 * * *', async () => {
  console.log('Running package expiration check...');
  
  try {
    const response = await axios.post(
      `${process.env.ALCHEMYST_SERVER_URL}/user/check-expirations`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${process.env.ALCHEMYST_CRON_SECRET_KEY}`
        }
      }
    );
    
    console.log('Expiration check completed:', response.data);
  } catch (error) {
    console.error('Expiration check failed:', error.message);
  }
});

console.log('Package expiration cron job initialized');