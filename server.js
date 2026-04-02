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
app.use('/images', express.static(path.join(__dirname, 'images')));

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Cloudinary Storage for PDFs
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'jotlad-results',
    allowed_formats: ['jpg', 'png', 'jpeg'], // Only allow images
    resource_type: 'image', // Change from 'raw' to 'image'
    public_id: `${originalName}` // Cloudinary handles the extension automatically for images
  }
});

const upload = multer({ storage: storage });

// ============ FIX 1: Correct Variable Name ============
// Changed MONGODB_URI to MONGO_URI to match your .env file
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Result Schema
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

// Compound index for unique result identification
resultSchema.index({ admissionNumber: 1, class: 1, term: 1, year: 1 }, { unique: true });

const Result = mongoose.model('Result', resultSchema);

// Admin Schema
const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const Admin = mongoose.model('Admin', adminSchema);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'jotlad-schools-secret-key-2024';

// Auth Middleware
const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (error) {
    res.status(400).json({ message: 'Invalid token.' });
  }
};

// ============ PUBLIC ROUTES ============

// Check if admission number exists
app.post('/api/check-admission', async (req, res) => {
  try {
    const { admissionNumber } = req.body;
    const results = await Result.find({
      admissionNumber: admissionNumber.toUpperCase()
    }).select('class term year studentName');

    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Invalid Admission Number'
      });
    }

    res.json({
      success: true,
      studentName: results[0].studentName,
      results: results
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get available classes/terms/years for student
app.post('/api/student-options', async (req, res) => {
  try {
    const { admissionNumber } = req.body;
    const results = await Result.find({
      admissionNumber: admissionNumber.toUpperCase()
    }).select('class term year');

    const classes = [...new Set(results.map(r => r.class))];
    const terms = [...new Set(results.map(r => r.term))];
    const years = [...new Set(results.map(r => r.year))];

    res.json({ success: true, classes, terms, years });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get specific result PDF
app.post('/api/get-result', async (req, res) => {
  try {
    const { admissionNumber, class: studentClass, term, year } = req.body;

    const result = await Result.findOne({
      admissionNumber: admissionNumber.toUpperCase(),
      class: studentClass,
      term: term,
      year: year
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Result not found for the selected criteria'
      });
    }

    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============ ADMIN ROUTES ============

// Admin Login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });

    if (!admin) {
      return res.status(400).json({ message: 'Invalid username or password' });
    }

    const validPassword = await bcrypt.compare(password, admin.password);
    if (!validPassword) {
      return res.status(400).json({ message: 'Invalid username or password' });
    }

    const token = jwt.sign({ id: admin._id, username: admin.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token, username: admin.username });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create initial admin (run once)
app.post('/api/admin/create', async (req, res) => {
  try {
    const { username, password } = req.body;
    const existingAdmin = await Admin.findOne({ username });

    if (existingAdmin) {
      return res.status(400).json({ message: 'Admin already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = new Admin({ username, password: hashedPassword });
    await admin.save();

    res.json({ success: true, message: 'Admin created successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get all results (Admin)
app.get('/api/admin/results', authMiddleware, async (req, res) => {
  try {
    const results = await Result.find().sort({ createdAt: -1 });
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Upload result (Admin)
app.post('/api/admin/upload', authMiddleware, upload.single('pdf'), async (req, res) => {
  try {
    const { admissionNumber, studentName, class: studentClass, term, year } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'PDF file is required' });
    }

    const result = new Result({
      admissionNumber: admissionNumber.toUpperCase(),
      studentName,
      class: studentClass,
      term,
      year,
      pdfUrl: req.file.path,
      publicId: req.file.filename
    });

    await result.save();
    res.json({ success: true, message: 'Result uploaded successfully', result });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        message: 'Result already exists for this student/class/term/year'
      });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update result (Admin)
app.put('/api/admin/results/:id', authMiddleware, upload.single('pdf'), async (req, res) => {
  try {
    const { id } = req.params;
    const { admissionNumber, studentName, class: studentClass, term, year } = req.body;

    const result = await Result.findById(id);
    if (!result) {
      return res.status(404).json({ message: 'Result not found' });
    }

    // If new PDF uploaded, delete old one
    if (req.file) {
      await cloudinary.uploader.destroy(result.publicId, { resource_type: 'raw' });
      result.pdfUrl = req.file.path;
      result.publicId = req.file.filename;
    }

    result.admissionNumber = admissionNumber.toUpperCase();
    result.studentName = studentName;
    result.class = studentClass;
    result.term = term;
    result.year = year;

    await result.save();
    res.json({ success: true, message: 'Result updated successfully', result });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete result (Admin)
app.delete('/api/admin/results/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Result.findById(id);

    if (!result) {
      return res.status(404).json({ message: 'Result not found' });
    }

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(result.publicId, { resource_type: 'raw' });

    // Delete from database
    await Result.findByIdAndDelete(id);

    res.json({ success: true, message: 'Result deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get single result (Admin)
app.get('/api/admin/results/:id', authMiddleware, async (req, res) => {
  try {
    const result = await Result.findById(req.params.id);
    if (!result) {
      return res.status(404).json({ message: 'Result not found' });
    }
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Serve static HTML pages
app.get('/result-checker', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'result-checker.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

// ============ FIX 2: Proper Server Start ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});