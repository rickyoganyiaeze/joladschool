// --- RAILWAY KEEP ALIVE ---
const http = require('http');
const setIntervalId = setInterval(() => {
  // We define a dummy request to self to keep the container alive
  const req = http.get(`http://localhost:${process.env.PORT || 3000}`, () => {});
  req.on('error', () => {}); // Ignore errors if not ready yet
}, 600000); // 10 Minutes
// -------------------------
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer'); // We still use multer to catch the file, but we won't save it to disk
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase limit for base64 data
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Result Schema
// CHANGED: Added pdfData field to store the actual file content
const resultSchema = new mongoose.Schema({
  admissionNumber: { type: String, required: true, uppercase: true },
  studentName: { type: String, required: true },
  class: { type: String, required: true },
  term: { type: String, required: true },
  year: { type: String, required: true },
  // NEW: This stores the PDF file as data
  pdfData: { type: String, required: true }, 
  createdAt: { type: Date, default: Date.now }
});

resultSchema.index({ admissionNumber: 1, class: 1, term: 1, year: 1 }, { unique: true });
const Result = mongoose.model('Result', resultSchema);

// Admin Schema
const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const Admin = mongoose.model('Admin', adminSchema);

const JWT_SECRET = process.env.JWT_SECRET || 'jotlad-schools-secret-key-2024';

// Auth Middleware
const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Access denied.' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    res.status(400).json({ message: 'Invalid token.' });
  }
};

// Configure Multer to use Memory Storage (stores file in RAM temporarily)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Helper function to convert buffer to base64 string
const bufferToBase64 = (buffer) => {
  return buffer.toString('base64');
};

// ============ PUBLIC ROUTES ============

app.post('/api/check-admission', async (req, res) => {
  try {
    const { admissionNumber } = req.body;
    const results = await Result.find({ admissionNumber: admissionNumber.toUpperCase() }).select('class term year studentName');
    if (results.length === 0) return res.status(404).json({ success: false, message: 'Invalid Admission Number' });
    res.json({ success: true, studentName: results[0].studentName, results });
  } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/api/student-options', async (req, res) => {
  try {
    const { admissionNumber } = req.body;
    const results = await Result.find({ admissionNumber: admissionNumber.toUpperCase() }).select('class term year');
    res.json({ success: true, classes: [...new Set(results.map(r => r.class))], terms: [...new Set(results.map(r => r.term))], years: [...new Set(results.map(r => r.year))] });
  } catch (error) { res.status(500).json({ success: false }); }
});

// Get specific result - Returns Base64 Data
app.post('/api/get-result', async (req, res) => {
  try {
    const { admissionNumber, class: studentClass, term, year } = req.body;
    const result = await Result.findOne({
      admissionNumber: admissionNumber.toUpperCase(),
      class: studentClass, term, year
    });
    
    if (!result) return res.status(404).json({ success: false, message: 'Result not found' });

    // Return the object. Frontend will handle displaying the base64 string.
    res.json({ success: true, result });
  } catch (error) { res.status(500).json({ success: false }); }
});

// ============ ADMIN ROUTES ============

app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin || !(await bcrypt.compare(password, admin.password))) return res.status(400).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ id: admin._id }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token, username: admin.username });
  } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/api/admin/create', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (await Admin.findOne({ username })) return res.status(400).json({ message: 'Admin exists' });
    const admin = new Admin({ username, password: await bcrypt.hash(password, 10) });
    await admin.save();
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false }); }
});

app.get('/api/admin/results', authMiddleware, async (req, res) => {
  const results = await Result.find().sort({ createdAt: -1 });
  res.json({ success: true, results });
});

// UPLOAD RESULT (Saves to Database)
app.post('/api/admin/upload', authMiddleware, upload.single('pdf'), async (req, res) => {
  try {
    const { admissionNumber, studentName, class: studentClass, term, year } = req.body;
    
    if (!req.file) return res.status(400).json({ message: 'PDF file is required' });

    // Convert file buffer to Base64 string for DB storage
    const pdfBase64 = bufferToBase64(req.file.buffer);

    const result = new Result({
      admissionNumber: admissionNumber.toUpperCase(),
      studentName,
      class: studentClass,
      term,
      year,
      pdfData: pdfBase64 // Save the data here
    });
    
    await result.save();
    res.json({ success: true, message: 'Result uploaded successfully!' });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'Result already exists.' });
    res.status(500).json({ success: false, message: error.message });
  }
});

// UPDATE RESULT
app.put('/api/admin/results/:id', authMiddleware, upload.single('pdf'), async (req, res) => {
  try {
    const { id } = req.params;
    const { admissionNumber, studentName, class: studentClass, term, year } = req.body;
    
    const result = await Result.findById(id);
    if (!result) return res.status(404).json({ message: 'Not found' });
    
    // If new file uploaded, replace data
    if (req.file) {
      result.pdfData = bufferToBase64(req.file.buffer);
    }

    result.admissionNumber = admissionNumber.toUpperCase();
    result.studentName = studentName;
    result.class = studentClass; result.term = term; result.year = year;
    
    await result.save();
    res.json({ success: true, message: 'Updated' });
  } catch (error) { res.status(500).json({ success: false }); }
});

// DELETE RESULT
app.delete('/api/admin/results/:id', authMiddleware, async (req, res) => {
  try {
    await Result.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (error) { res.status(500).json({ success: false }); }
});

app.get('/api/admin/results/:id', authMiddleware, async (req, res) => {
  const result = await Result.findById(req.params.id);
  if (!result) return res.status(404).json({ message: 'Not found' });
  res.json({ success: true, result });
});

// Serve HTML
app.get('/result-checker', (req, res) => res.sendFile(path.join(__dirname, 'public', 'result-checker.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));