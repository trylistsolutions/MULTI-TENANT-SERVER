const mongoose = require('mongoose');


const playboxConnection = mongoose.createConnection(process.env.PLAYBOX_MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

playboxConnection.on('connected', () => {
  console.log('🪀 Connected to Playbox Database');
});

playboxConnection.on('error', (err) => {
  console.error('Playbox Database connection error:', err);
});

module.exports = playboxConnection;
