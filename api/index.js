// --- IMPORTS ---
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const jwt = require('jsonwebtoken');

// --- APP SETUP ---
const app = express();

// --- SUPER CORS (Fixes Connection Error) ---
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// --- DB CONNECTION ---
const MONGO_URI = "mongodb+srv://joladschool_add:Jotlad2024Secure@joladschool.uludk18.mongodb.net/?appName=joladschool&retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
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

// Setup Admin
app.get('/setup-admin', async (req, res) => {
  try {
    const existing = await Admin.findOne({ username: 'admin' });
    if (existing) return res.json({ message: 'Admin exists. User: admin, Pass: password123' });
    
    const admin = new Admin({ username: 'admin', password: 'password123' });
    await admin.save();
    res.status(201).json({ message: 'Admin Created! User: admin, Pass: password123' });
  } catch(e) { res.status(500).json({ error: e.message }); }
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

// ADMIN LOGIN
app.post('/admin/login', async (req, res) => {
  console.log("LOGIN HIT!"); // Log 1

  // 1. Check Body
  if(!req.body) return res.status(400).send('No body');
  console.log("Body exists"); // Log 2

  const { username, password } = req.body;
  
  // 2. Find User
  const user = await Admin.findOne({ username });
  if (!user) {
      console.log("User not found"); // Log 3
      return res.status(404).json({ message: 'User not found' });
  }
  
  // 3. Check Password
  if (user.password !== password) {
      console.log("Wrong password"); // Log 4
      return res.status(401).json({ message: 'Invalid credentials' });
  }

  // 4. Success
  console.log("Success!"); // Log 5
  const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ success: true, token, username: user.username });
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