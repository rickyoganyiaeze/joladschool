const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer'); // We only need multer now
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs'); // Needed to check/delete files
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure 'uploads' directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

// Serve uploaded files statically
// This makes files available at http://your-domain/uploads/filename.pdf
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// ============ NEW STORAGE CONFIGURATION ============
// Saves files locally as "ADMISSION_NUMBER.pdf"
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir); // Save to 'uploads' folder
  },
  filename: function (req, file, cb) {
    // Use admission number as filename so it's easy to find/overwrite
    const admissionNumber = req.body.admissionNumber ? req.body.admissionNumber.toUpperCase() : 'UNKNOWN';
    cb(null, `${admissionNumber}-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed!'), false);
  }
};

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Limit 10MB
  fileFilter: fileFilter
});

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Result Schema
// Removed publicId, kept pdfUrl but it will now store the relative path like "/uploads/file.pdf"
const resultSchema = new mongoose.Schema({
  admissionNumber: { type: String, required: true, uppercase: true },
  studentName: { type: String, required: true },
  class: { type: String, required: true },
  term: { type: String, required: true },
  year: { type: String, required: true },
  pdfUrl: { type: String, required: true }, // Will now store /uploads/filename.pdf
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
  if (!token) return res.status(401).json({ message: 'Access denied. No token provided.' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (error) {
    res.status(400).json({ message: 'Invalid token.' });
  }
};

// ============ PUBLIC ROUTES ============

app.post('/api/check-admission', async (req, res) => {
  try {
    const { admissionNumber } = req.body;
    const results = await Result.find({ admissionNumber: admissionNumber.toUpperCase() }).select('class term year studentName');
    
    if (results.length === 0) return res.status(404).json({ success: false, message: 'Invalid Admission Number' });
    
    res.json({ success: true, studentName: results[0].studentName, results: results });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/student-options', async (req, res) => {
  try {
    const { admissionNumber } = req.body;
    const results = await Result.find({ admissionNumber: admissionNumber.toUpperCase() }).select('class term year');
    const classes = [...new Set(results.map(r => r.class))];
    const terms = [...new Set(results.map(r => r.term))];
    const years = [...new Set(results.map(r => r.year))];
    res.json({ success: true, classes, terms, years });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get specific result - Returns the direct link to the PDF on your server
app.post('/api/get-result', async (req, res) => {
  try {
    const { admissionNumber, class: studentClass, term, year } = req.body;
    
    const result = await Result.findOne({
      admissionNumber: admissionNumber.toUpperCase(),
      class: studentClass,
      term: term,
      year: year
    });
    
    if (!result) return res.status(404).json({ success: false, message: 'Result not found' });
    
    // The pdfUrl now contains something like "/uploads/12345-1234.pdf"
    // This is a valid link because we set up static serving above
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============ ADMIN ROUTES ============

app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(400).json({ message: 'Invalid username or password' });
    
    const validPassword = await bcrypt.compare(password, admin.password);
    if (!validPassword) return res.status(400).json({ message: 'Invalid username or password' });
    
    const token = jwt.sign({ id: admin._id, username: admin.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token, username: admin.username });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/admin/create', async (req, res) => {
  try {
    const { username, password } = req.body;
    const existingAdmin = await Admin.findOne({ username });
    if (existingAdmin) return res.status(400).json({ message: 'Admin already exists' });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = new Admin({ username, password: hashedPassword });
    await admin.save();
    res.json({ success: true, message: 'Admin created successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/admin/results', authMiddleware, async (req, res) => {
  try {
    const results = await Result.find().sort({ createdAt: -1 });
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// UPLOAD RESULT (Fixed for Local Storage)
app.post('/api/admin/upload', authMiddleware, upload.single('pdf'), async (req, res) => {
  try {
    const { admissionNumber, studentName, class: studentClass, term, year } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ message: 'PDF file is required' });
    }

    // Construct the URL that the frontend will use to view/download
    // Since we serve uploads statically as '/uploads', the url is just /uploads/filename
    const pdfUrl = '/uploads/' + req.file.filename;

    const result = new Result({
      admissionNumber: admissionNumber.toUpperCase(),
      studentName,
      class: studentClass,
      term,
      year,
      pdfUrl: pdfUrl // Saving the local path
    });
    
    await result.save();
    res.json({ success: true, message: 'Result uploaded successfully', result });
  } catch (error) {
    // If DB save fails, delete the uploaded file to clean up
    if (req.file) fs.unlinkSync(req.file.path);
    
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Result already exists for this student/class/term/year' });
    }
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// UPDATE RESULT (Fixed for Local Storage)
app.put('/api/admin/results/:id', authMiddleware, upload.single('pdf'), async (req, res) => {
  try {
    const { id } = req.params;
    const { admissionNumber, studentName, class: studentClass, term, year } = req.body;
    
    const result = await Result.findById(id);
    if (!result) return res.status(404).json({ message: 'Result not found' });
    
    // If new PDF uploaded, delete old one from disk
    if (req.file) {
      const oldFilePath = path.join(__dirname, result.pdfUrl); // Convert URL to file path
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
      result.pdfUrl = '/uploads/' + req.file.filename;
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

// DELETE RESULT (Fixed for Local Storage)
app.delete('/api/admin/results/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Result.findById(id);
    
    if (!result) return res.status(404).json({ message: 'Result not found' });
    
    // Delete file from server disk
    const filePath = path.join(__dirname, result.pdfUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Delete from database
    await Result.findByIdAndDelete(id);
    
    res.json({ success: true, message: 'Result deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/admin/results/:id', authMiddleware, async (req, res) => {
  try {
    const result = await Result.findById(req.params.id);
    if (!result) return res.status(404).json({ message: 'Result not found' });
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Serve HTML Pages
app.get('/result-checker', (req, res) => res.sendFile(path.join(__dirname, 'public', 'result-checker.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));