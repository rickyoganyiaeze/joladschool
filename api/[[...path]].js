const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const jwt = require('jsonwebtoken');

const app = express();

// CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// DB
const MONGO_URI = "mongodb+srv://joladschool_add:Jotlad2024Secure@joladschool.uludk18.mongodb.net/?appName=joladschool&retryWrites=true&w=majority";
mongoose.connect(MONGO_URI).then(() => console.log('DB OK')).catch(err => console.error(err));

// Schemas
const Result = mongoose.model('Result', new mongoose.Schema({
  admissionNumber: String, studentName: String, class: String,
  term: String, year: String, pdfData: String, createdAt: { type: Date, default: Date.now }
}));
const admin = mongoose.model('admin', new mongoose.Schema({
  username: { type: String, unique: true }, password: String
}));
const JWT_SECRET = 'jotlad-secret-2024';

// Middleware
const auth = async (req, res, next) => {
  const t = req.header('Authorization')?.replace('Bearer ', '');
  if (!t) return res.status(401).json({m:'No token'});
  try { req.user = jwt.verify(t, JWT_SECRET); next(); } catch(e) { res.status(400).json({m:'Bad token'}); }
};
const up = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ROUTES

app.get('/hello', (req, res) => res.json({ m: 'Active' }));

app.get('/setup-admin', async (req, res) => {
  const ex = await admin.findOne({ username: 'admin' });
  if (ex) return res.json({m:'Exists'});
  await new admin({ username: 'admin', password: 'password123' }).save();
  res.json({m:'Created'});
});

app.post('/check-admission', async (req, res) => {
  try {
    const r = await Result.find({ admissionNumber: req.body.admissionNumber?.toUpperCase() }).select('class term year studentName');
    res.json(r.length ? { success: true, studentName: r[0].studentName, results: r } : { success: false, m: 'Invalid' });
  } catch(e) { res.status(500).json({success:false}); }
});

app.post('/get-result', async (req, res) => {
  try {
    const r = await Result.findOne({ admissionNumber: req.body.admissionNumber?.toUpperCase(), class: req.body.class, term: req.body.term, year: req.body.year });
    res.json(r ? { success: true, result: r } : { success: false, m: 'Not found' });
  } catch(e) { res.status(500).json({success:false}); }
});

app.post('/admin/login', async (req, res) => {
  try {
    const u = await admin.findOne({ username: req.body.username });
    if (!u) return res.status(404).json({ m: 'User not found' });
    if (u.password !== req.body.password) return res.status(401).json({ m: 'Invalid creds' });
    const t = jwt.sign({ id: u._id }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token: t, username: u.username });
  } catch(e) { res.status(500).json({ m: e.message }); }
});

app.post('/admin/upload', auth, up.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send('PDF required');
    await new Result({
      admissionNumber: req.body.admissionNumber?.toUpperCase(), studentName: req.body.studentName,
      class: req.body.class, term: req.body.term, year: req.body.year,
      pdfData: req.file.buffer.toString('base64')
    }).save();
    res.json({ success: true, m: 'Uploaded' });
  } catch(e) { if(e.code===11000) return res.status(400).json({m:'Exists'}); res.status(500).json({e:e.message}); }
});

app.get('/admin/results', auth, async (req, res) => res.json({ success: true, results: await Result.find().sort({createdAt:-1}) }));

app.delete('/admin/results/:id', auth, async (req, res) => { await Result.findByIdAndDelete(req.params.id); res.json({ success: true }); });

app.put('/admin/results/:id', auth, up.single('pdf'), async (req, res) => {
  try {
    const r = await Result.findById(req.params.id);
    if(!r) return res.status(404).send('Not found');
    if(req.file) r.pdfData = req.file.buffer.toString('base64');
    Object.assign(r, { admissionNumber: req.body.admissionNumber?.toUpperCase(), studentName: req.body.studentName, class: req.body.class, term: req.body.term, year: req.body.year });
    await r.save(); res.json({ success: true });
  } catch(e) { res.status(500).json({success:false}); }
});

// CATCH ALL HANDLER
// This ensures /api/login works even if Vercel is confused
export default async function handler(req, res) {
  // This passes the request to our Express app
  return app(req, res);
}