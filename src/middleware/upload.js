'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');

fs.mkdirSync(config.paths.uploads, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.paths.uploads),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = config.uploads.allowedExt.includes(ext) ? ext : '';
    const name = `rcpt_${Date.now()}_${crypto.randomBytes(8).toString('hex')}${safeExt}`;
    cb(null, name);
  },
});

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const okMime = config.uploads.allowedMime.includes(file.mimetype);
  const okExt = config.uploads.allowedExt.includes(ext);
  if (okMime && okExt) return cb(null, true);
  const err = new Error('Only images (JPG, PNG, WEBP, GIF) or PDF files are allowed.');
  err.code = 'INVALID_FILE_TYPE';
  cb(err);
}

const uploadReceipt = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.uploads.maxBytes, files: 1 },
}).single('receipt');

// Wrap to turn multer errors into clean JSON responses.
function receiptUpload(req, res, next) {
  uploadReceipt(req, res, (err) => {
    if (!err) return next();

    const respond = () => {
      if (res.headersSent) return;
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `File too large. Maximum size is ${Math.round(config.uploads.maxBytes / 1024 / 1024)}MB.` });
      }
      return res.status(400).json({ error: err.message || 'Upload failed.' });
    };

    // Multer may reject (e.g. bad file type) before the request body is fully
    // read. Drain the remaining bytes first, otherwise some clients/browsers
    // see a connection reset instead of our clean error response.
    if (req.readable && !req.complete) {
      req.on('end', respond);
      req.on('error', respond);
      req.resume();
      setTimeout(respond, 1500); // safety net (guarded by res.headersSent)
    } else {
      respond();
    }
  });
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (d) => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

module.exports = { receiptUpload, sha256File };
