const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Atlas Connected Successfully'))
  .catch(err => {
    console.log('MongoDB Connection Error:', err);
    process.exit(1);
  });

// UPDATED Schema to include Term and Year
const resultSchema = new mongoose.Schema({
  admissionNumber: { type: String, required: true },
  studentName: { type: String, required: true },
  studentClass: { type: String, required: true },
  term: { type: String, required: true },
  academicYear: { type: String, required: true },
  resultFile: { type: String, required: true },
  fileType: { type: String, required: true },
  availabilityStart: Date,
  availabilityEnd: Date,
  createdAt: { type: Date, default: Date.now }
});

// Remove unique: true so a student can have multiple results for different terms
if (resultSchema.indexes().length === 0) {
    resultSchema.index({ admissionNumber: 1, term: 1, academicYear: 1 }, { unique: true });
}

const Result = mongoose.model('Result', resultSchema);

const storage = multer.memoryStorage(); 
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10000000 },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|pdf/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype && extname) return cb(null, true);
    cb('Error: Images and PDFs only!');
  }
});

// --- STUDENT LOGIN (UPDATED) ---
app.post('/api/login', async (req, res) => {
  try {
    const { admissionNumber, studentClass, term, academicYear } = req.body;
    if (!admissionNumber || !studentClass || !term || !academicYear) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const student = await Result.findOne({ 
      admissionNumber: admissionNumber.toUpperCase(),
      studentClass: studentClass,
      term: term,
      academicYear: academicYear
    });

    if (!student) return res.status(404).json({ success: false, message: 'Result not found for this combination.' });

    const now = new Date();
    if (student.availabilityStart && student.availabilityEnd) {
      if (now < new Date(student.availabilityStart) || now > new Date(student.availabilityEnd)) {
        return res.status(403).json({ success: false, message: 'Results are not currently available.' });
      }
    }
    res.json({ success: true, student });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// Admin Middleware
const adminAuth = (req, res, next) => {
  const key = req.headers['admin-key'] || req.query.key;
  if (key !== process.env.ADMIN_KEY) return res.status(401).json({ success: false, message: 'Unauthorized' });
  next();
};

// Upload Result (UPDATED)
app.post('/api/admin/upload', adminAuth, upload.single('resultFile'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const fileBase64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    const newResult = new Result({
      admissionNumber: req.body.admissionNumber,
      studentName: req.body.studentName,
      studentClass: req.body.studentClass,
      term: req.body.term,
      academicYear: req.body.academicYear,
      resultFile: `data:${mimeType};base64,${fileBase64}`,
      fileType: mimeType.includes('pdf') ? 'pdf' : 'image',
      availabilityStart: req.body.start,
      availabilityEnd: req.body.end
    });

    await newResult.save();
    res.json({ success: true, message: 'Result uploaded', data: newResult });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get All Results (Admin)
app.get('/api/admin/results', adminAuth, async (req, res) => {
  try {
    const results = await Result.find().select('-resultFile').sort({ createdAt: -1 });
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get Single Result (Admin View)
app.get('/api/admin/result/:id', adminAuth, async (req, res) => {
  try {
    const result = await Result.findById(req.params.id);
    if (!result) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, student: result });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// Update Result (UPDATED)
app.put('/api/admin/results/:id', adminAuth, upload.single('resultFile'), async (req, res) => {
  try {
    const updateData = {
      admissionNumber: req.body.admissionNumber,
      studentName: req.body.studentName,
      studentClass: req.body.studentClass,
      term: req.body.term,
      academicYear: req.body.academicYear,
      availabilityStart: req.body.start,
      availabilityEnd: req.body.end
    };

    if (req.file) {
      const fileBase64 = req.file.buffer.toString('base64');
      const mimeType = req.file.mimetype;
      updateData.resultFile = `data:${mimeType};base64,${fileBase64}`;
      updateData.fileType = mimeType.includes('pdf') ? 'pdf' : 'image';
    }

    const updatedResult = await Result.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json({ success: true, data: updatedResult });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete Result
app.delete('/api/admin/results/:id', adminAuth, async (req, res) => {
  try {
    await Result.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));