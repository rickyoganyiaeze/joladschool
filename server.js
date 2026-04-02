const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Cloudinary Storage for PDFs (FIXED FOR DOWNLOADS)
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // This ensures the file keeps its name and ends with .pdf
    const originalName = file.originalname.split('.').slice(0, -1).join('.');
    return {
      folder: 'jotlad-results',
      allowed_formats: ['pdf'],
      resource_type: 'raw',
      public_id: `${originalName}.pdf` 
    };
  }
});

const upload = multer({ storage: storage });

// ============ DATABASE & MODELS ============

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB Atlas');
    // Auto-create admin logic...
    const Admin = mongoose.model('Admin');
    try {
      const adminExists = await Admin.findOne({ username: 'admin' });
      if (!adminExists) {
        console.log('⚠️ No admin found. Creating default admin...');
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await Admin.create({ username: 'admin', password: hashedPassword });
        console.log('✅ Default Admin created!');
      }
    } catch (err) {
      console.error('Admin check error:', err);
    }
  })
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Schemas
const resultSchema = new mongoose.Schema({
  admissionNumber: { type: String, required: true, uppercase: true },
  studentName: { type: String, required: true },
  class: { type: String, required: true },
  term: { type: String, required: true },
  year: { type: String, required: true },
  pdfUrl: { type: String, required: true },
  publicId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
resultSchema.index({ admissionNumber: 1, class: 1, term: 1, year: 1 }, { unique: true });
const Result = mongoose.model('Result', resultSchema);

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
  } catch (e) {
    res.status(400).json({ message: 'Invalid token.' });
  }
};

// ============ ROUTES ============

// Public Routes
app.post('/api/check-admission', async (req, res) => {
  try {
    const results = await Result.find({ admissionNumber: req.body.admissionNumber.toUpperCase() }).select('class term year studentName');
    if (results.length === 0) return res.status(404).json({ success: false, message: 'Invalid Admission Number' });
    res.json({ success: true, studentName: results[0].studentName, results });
  } catch (e) { res.status(500).json({ success: false, message: 'Server error' }); }
});

app.post('/api/student-options', async (req, res) => {
  try {
    const results = await Result.find({ admissionNumber: req.body.admissionNumber.toUpperCase() }).select('class term year');
    const classes = [...new Set(results.map(r => r.class))];
    const terms = [...new Set(results.map(r => r.term))];
    const years = [...new Set(results.map(r => r.year))];
    res.json({ success: true, classes, terms, years });
  } catch (e) { res.status(500).json({ success: false, message: 'Server error' }); }
});

app.post('/api/get-result', async (req, res) => {
  try {
    const { admissionNumber, class: studentClass, term, year } = req.body;
    const result = await Result.findOne({ admissionNumber: admissionNumber.toUpperCase(), class: studentClass, term, year });
    if (!result) return res.status(404).json({ success: false, message: 'Result not found' });
    res.json({ success: true, result });
  } catch (e) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// Admin Routes
app.post('/api/admin/login', async (req, res) => {
  try {
    const admin = await Admin.findOne({ username: req.body.username });
    if (!admin || !(await bcrypt.compare(req.body.password, admin.password))) return res.status(400).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ id: admin._id, username: admin.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token, username: admin.username });
  } catch (e) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// Upload Route
app.post('/api/admin/upload', authMiddleware, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'PDF file required' });
    const { admissionNumber, studentName, class: studentClass, term, year } = req.body;
    const result = new Result({
      admissionNumber: admissionNumber.toUpperCase(), studentName, class: studentClass, term, year,
      pdfUrl: req.file.path, publicId: req.file.filename
    });
    await result.save();
    res.json({ success: true, message: 'Uploaded!', result });
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ message: 'Result already exists' });
    res.status(500).json({ success: false, message: 'Upload failed: ' + e.message });
  }
});

app.get('/api/admin/results', authMiddleware, async (req, res) => {
  const results = await Result.find().sort({ createdAt: -1 });
  res.json({ success: true, results });
});

app.delete('/api/admin/results/:id', authMiddleware, async (req, res) => {
  try {
    const result = await Result.findById(req.params.id);
    if (result) {
      await cloudinary.uploader.destroy(result.publicId, { resource_type: 'raw' });
      await Result.findByIdAndDelete(req.params.id);
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ success: false, message: 'Error deleting' }); }
});

// ============ SERVE HTML PAGES ============
// This part fixes the "Cannot GET" error

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'result-checker.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));