// --- IMPORTS ---
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// --- APP SETUP ---
const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// --- DB CONNECTION ---
// TEMPORARY HARDCODE - REMOVE LATER FOR SECURITY
const MONGO_URI = "mongodb+srv://joladschool_admin:Jotlad2024Secure@joladschool.uludk18.mongodb.net/?appName=joladschool";
if (!MONGO_URI) {
    console.error("ERROR: MONGO_URI is missing!");
}
mongoose.connect(MONGO_URI || '')
  .then(() => console.log('✅ DB Connected'))
  .catch(err => console.error('❌ DB Error:', err));

// --- SCHEMAS ---
const ResultSchema = new mongoose.Schema({
  admissionNumber: String, studentName: String, class: String,
  term: String, year: String, pdfData: String,
  createdAt: { type: Date, default: Date.now }
});
const Result = mongoose.model('Result', ResultSchema);

const AdminSchema = new mongoose.Schema({
  username: { type: String, unique: true }, password: String
});
const Admin = mongoose.model('Admin', AdminSchema);

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

// --- HELPERS ---
const authMiddleware = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) { res.status(400).json({ message: 'Bad token' }); }
};
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// --- ROUTES ---

// Test
app.get('/hello', (req, res) => res.json({ msg: 'Active' }));

// --- SECRET: CREATE ADMIN ROUTE ---
app.get('/setup-admin', async (req, res) => {
  try {
    const existing = await Admin.findOne({ username: 'admin' });
    if (existing) {
      return res.json({ message: 'Admin already exists. Username: admin, Password: password123' });
    }
    
    const hash = await bcrypt.hash('password123', 10);
    const admin = new Admin({ username: 'admin', password: hash });
    await admin.save();
    
    res.status(201).json({ message: 'Admin Created! Username: admin, Password: password123' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Check Admission
app.post('/check-admission', async (req, res) => {
  try {
    const r = await Result.find({ admissionNumber: req.body.admissionNumber?.toUpperCase() }).select('class term year studentName');
    res.json(r.length ? { success: true, studentName: r[0].studentName, results: r } : { success: false, message: 'Invalid' });
  } catch(e) { res.status(500).json({success:false}); }
});

// Get Result
app.post('/get-result', async (req, res) => {
  try {
    const r = await Result.findOne({ admissionNumber: req.body.admissionNumber?.toUpperCase(), class: req.body.class, term: req.body.term, year: req.body.year });
    res.json(r ? { success: true, result: r } : { success: false, message: 'Not found' });
  } catch(e) { res.status(500).json({success:false}); }
});

// Admin Login
app.post('/admin/login', async (req, res) => {
  try {
    if(!req.body.username || !req.body.password) return res.status(400).send('Missing credentials');

    const a = await Admin.findOne({ username: req.body.username });
    
    if (!a) return res.status(400).json({ message: 'User not found' });
    
    const valid = await bcrypt.compare(req.body.password, a.password);
    if (!valid) return res.status(400).json({ message: 'Invalid Password' });

    const token = jwt.sign({ id: a._id }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token, username: a.username });

  } catch(e) { 
    console.error("LOGIN ERROR:", e); 
    res.status(500).json({ message: e.message }); 
  }
});

// Upload
app.post('/admin/upload', authMiddleware, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send('PDF required');
    const result = new Result({
      admissionNumber: req.body.admissionNumber?.toUpperCase(),
      studentName: req.body.studentName, class: req.body.class, 
      term: req.body.term, year: req.body.year,
      pdfData: req.file.buffer.toString('base64')
    });
    await result.save();
    res.json({ success: true, message: 'Uploaded' });
  } catch(e) {
     if(e.code === 11000) return res.status(400).json({message:'Exists'});
     res.status(500).json({error:e.message});
  }
});

// Get All Results
app.get('/admin/results', authMiddleware, async (req, res) => {
  res.json({ success: true, results: await Result.find().sort({createdAt:-1}) });
});

// Delete
app.delete('/admin/results/:id', authMiddleware, async (req, res) => {
  await Result.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// Update
app.put('/admin/results/:id', authMiddleware, upload.single('pdf'), async (req, res) => {
  try {
    const result = await Result.findById(req.params.id);
    if(!result) return res.status(404).send('Not found');
    if(req.file) result.pdfData = req.file.buffer.toString('base64');
    Object.assign(result, {
      admissionNumber: req.body.admissionNumber?.toUpperCase(), studentName: req.body.studentName,
      class: req.body.class, term: req.body.term, year: req.body.year
    });
    await result.save();
    res.json({ success: true });
  } catch(e) { res.status(500).json({success:false}); }
});

// EXPORT
module.exports = app;