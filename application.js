// routes/applications.js
const express = require('express');
const sql = require('mssql');
const multer = require('multer');
const path = require('path');

const router = express.Router();

// 🔐 Optional: Add auth middleware later (e.g., for admin-only routes)
// const authenticateToken = require('../middleware/auth');

// 📁 Multer storage setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './public/uploads/'); // Ensure this folder exists!
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `cv-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, DOCX files allowed'));
    }
  }
});

// ✅ POST /api/applications
router.post('/', upload.single('resume'), async (req, res) => {
  const { 
    firstName, lastName, email, phone, 
    address, city, postalCode, country, 
    jobRole, howFound, coverLetter 
  } = req.body;

  // 🔍 Validation
  if (!firstName || !lastName || !email || !phone || !address || !city || !postalCode || !country || !jobRole || !howFound) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  let cvFileName = null;
  if (req.file) {
    cvFileName = req.file.filename;
  }

  try {
    const pool = await sql.connect();
    const result = await pool.request()
      .input('FirstName', sql.NVarChar, firstName)
      .input('LastName', sql.NVarChar, lastName)
      .input('Email', sql.NVarChar, email)
      .input('Phone', sql.NVarChar, phone)
      .input('Address', sql.NVarChar, address)
      .input('City', sql.NVarChar, city)
      .input('PostalCode', sql.NVarChar, postalCode)
      .input('Country', sql.NVarChar, country)
      .input('JobRole', sql.NVarChar, jobRole)
      .input('HowFound', sql.NVarChar, howFound)
      .input('CoverLetter', sql.NVarChar, coverLetter)
      .input('CVFileName', sql.NVarChar, cvFileName)
      .query(`
        INSERT INTO JobApplications (
          FirstName, LastName, Email, Phone, Address, City, PostalCode, 
          Country, JobRole, HowFound, CoverLetter, CVFileName
        ) 
        OUTPUT INSERTED.ApplicationID
        VALUES (
          @FirstName, @LastName, @Email, @Phone, @Address, @City, @PostalCode,
          @Country, @JobRole, @HowFound, @CoverLetter, @CVFileName
        )
      `);

    res.status(201).json({ 
      message: 'Application submitted successfully',
      applicationId: result.recordset[0].ApplicationID
    });

  } catch (err) {
    console.error('DB Error:', err);
    res.status(500).json({ 
      error: 'Failed to submit application',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

module.exports = router;