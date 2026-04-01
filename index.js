require('dotenv').config(); // 1. Load secret variables from .env file
const express = require('express');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// 2. Define what an "Admin" item looks like
const AdminLogSchema = new mongoose.Schema({
  action: String,
  timestamp: { type: Date, default: Date.now }
});

// Create the model (This will create a collection called 'adminlogs' in your 'admin' DB)
const AdminLog = mongoose.model('AdminLog', AdminLogSchema);

async function startServer() {
  try {
    // 3. Connect to MongoDB
    // We use the MONGO_URI from the .env file
    console.log("⏳ Connecting to MongoDB 'admin' database...");
    
    await mongoose.connect(process.env.MONGO_URI);
    
    console.log("✅ CONNECTED successfully to the Admin Database!");

    // --- ROUTES (Your "Admin Page" tests) ---

    // Route 1: Home page
    app.get('/', (req, res) => {
      res.send('<h1>Admin Server is Running!</h1><p>Try going to <a href="/test-add">/test-add</a></p>');
    });

    // Route 2: Add a test entry to the admin database
    app.get('/test-add', async (req, res) => {
      try {
        const newLog = new AdminLog({
          action: "Test login attempt"
        });
        await newLog.save();
        res.send("✅ Success! Added a test document to the 'admin' database.");
      } catch (err) {
        res.status(500).send("Error writing to DB: " + err.message);
      }
    });

    // Route 3: View all entries in the admin database
    app.get('/test-view', async (req, res) => {
      try {
        const logs = await AdminLog.find();
        res.json(logs);
      } catch (err) {
        res.status(500).send("Error reading DB: " + err.message);
      }
    });

    // Start the server
    app.listen(PORT, () => {
      console.log(`🚀 Server listening at http://localhost:${PORT}`);
    });

  } catch (error) {
    // This handles the ECONNREFUSED error
    console.error("❌ Connection Failed!");
    console.error(error);
  }
}

startServer();