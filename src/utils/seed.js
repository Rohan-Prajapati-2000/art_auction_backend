// Seeds exactly 1 admin + 5 users, as required by the assignment
// ("Signup isn't needed. Seed 1 admin and at least 5 users, and share
// their login credentials with your submission.")
//
// Run with: npm run seed
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const User = require('../models/User');

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@auction.test';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';
const USER_PASSWORD = process.env.SEED_USER_PASSWORD || 'User@123';

const USERS = [
  { name: 'Aarav Sharma', email: 'aarav@auction.test' },
  { name: 'Diya Patel', email: 'diya@auction.test' },
  { name: 'Rohan Mehta', email: 'rohan@auction.test' },
  { name: 'Isha Kapoor', email: 'isha@auction.test' },
  { name: 'Kabir Singh', email: 'kabir@auction.test' },
];

async function upsertUser({ name, email, password, role }) {
  const hashed = await User.hashPassword(password);
  const user = await User.findOneAndUpdate(
    { email },
    { $set: { name, email, role }, $setOnInsert: { password: hashed } },
    { upsert: true, new: true },
  );
  // If the user already existed, make sure the password matches the seed
  // value too, so re-running `npm run seed` is always idempotent & predictable.
  user.password = hashed;
  await user.save();
  return user;
}

async function run() {
  await connectDB();

  const admin = await upsertUser({
    name: 'Auction Admin',
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    role: 'admin',
  });

  const createdUsers = [];
  for (const u of USERS) {
    const user = await upsertUser({ ...u, password: USER_PASSWORD, role: 'user' });
    createdUsers.push(user);
  }

  console.log('\n===== Seed complete =====');
  console.log('Admin login:');
  console.log(`  email:    ${admin.email}`);
  console.log(`  password: ${ADMIN_PASSWORD}`);
  console.log('\nUser logins (same password for all):');
  createdUsers.forEach((u) => console.log(`  email: ${u.email.padEnd(20)} password: ${USER_PASSWORD}`));
  console.log('==========================\n');

  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
