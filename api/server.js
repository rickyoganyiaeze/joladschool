const express = require('express');
const app = express();

// This is a simple test to see if Vercel works
app.get('/hello', (req, res) => {
  res.json({ message: 'API is Working!' });
});

module.exports = app;