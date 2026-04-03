const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// --- DATABASE CONNECTION ---
const connectDB = async () => {
  if (mongoose.connection.readyState === 0) {
    try {
      await mongoose.connect(process.env.MONGO_URI);
      console.log('✅ DB Connected');
    } catch (err) { console.error(err); }
  }
};
connectDB();

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

const JWT_SECRET = process.env.JWT_SECRET || 'secret-2024';

// --- MIDDLEWARE ---
const authMiddleware = async (req, res, next) => {
  await connectDB();
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) { res.status(400).json({ message: 'Bad token' }); }
};

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// --- ROUTES ---

// 1. Test
app.get('/hello', (req, res) => res.json({ msg: 'API Active' }));

// 2. Check Admission
app.post('/check-admission', async (req, res) => {
  await connectDB();
  try {
    const r = await Result.find({ admissionNumber: req.body.admissionNumber?.toUpperCase() }).select('class term year studentName');
    res.json(r.length ? { success: true, studentName: r[0].studentName, results: r } : { success: false, message: 'Invalid' });
  } catch(e) { res.status(500).json({success:false}); }
});

// 3. Get Result (Returns Base64 PDF)
app.post('/get-result', async (req, res) => {
  await connectDB();
  try {
    const r = await Result.findOne({ admissionNumber: req.body.admissionNumber?.toUpperCase(), class: req.body.class, term: req.body.term, year: req.body.year });
    res.json(r ? { success: true, result: r } : { success: false, message: 'Not found' });
  } catch(e) { res.status(500).json({success:false}); }
});

// 4. Admin Login
app.post('/admin/login', async (req, res) => {
  await connectDB();
  try {
    const a = await Admin.findOne({ username: req.body.username });
    if (!a || !(await bcrypt.compare(req.body.password, a.password))) return res.status(400).json({ message: 'Invalid creds' });
    const token = jwt.sign({ id: a._id }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token, username: a.username });
  } catch(e) { 
    console.error(e); // Log error to Vercel dashboard to debug
    res.status(500).json({ success: false, message: 'Server error' }); 
  }
});

// 5. Upload Result
app.post('/admin/upload', authMiddleware, upload.single('pdf'), async (req, res) => {
  await connectDB();
  try {
    if (!req.file) return res.status(400).send('PDF required');
    
    const result = new Result({
      admissionNumber: req.body.admissionNumber?.toUpperCase(),
      studentName: req.body.studentName,
      class: req.body.class, term: req.body.term, year: req.body.year,
      pdfData: req.file.buffer.toString('base64')
    });
    await result.save();
    res.json({ success: true, message: 'Uploaded' });
  } catch(e) {
     if(e.code === 11000) return res.status(400).json({message:'Exists'});
     res.status(500).json({error:e.message});
  }
});

// 6. Get All Results
app.get('/admin/results', authMiddleware, async (req, res) => {
  await connectDB();
  res.json({ success: true, results: await Result.find().sort({createdAt:-1}) });
});

// 7. Delete Result
app.delete('/admin/results/:id', authMiddleware, async (req, res) => {
  await connectDB();
  await Result.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// 8. Update Result
app.put('/admin/results/:id', authMiddleware, upload.single('pdf'), async (req, res) => {
  await connectDB();
  try {
    const result = await Result.findById(req.params.id);
    if(!result) return res.status(404).send('Not found');
    if(req.file) result.pdfData = req.file.buffer.toString('base64');
    
    Object.assign(result, {
      admissionNumber: req.body.admissionNumber?.toUpperCase(),
      studentName: req.body.studentName,
      class: req.body.class, term: req.body.term, year: req.body.year
    });
    await result.save();
    res.json({ success: true });
  } catch(e) { res.status(500).json({success:false}); }
});

export default app;