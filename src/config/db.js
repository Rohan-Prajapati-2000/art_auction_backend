const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is not set in the environment');
  }

  mongoose.set('strictQuery', true);

  await mongoose.connect(uri);

  console.log(`[db] connected to MongoDB`);

  mongoose.connection.on('disconnected', () => {
    console.warn('[db] MongoDB disconnected');
  });

  mongoose.connection.on('error', (err) => {
    console.error('[db] MongoDB connection error:', err.message);
  });
}

module.exports = { connectDB };
