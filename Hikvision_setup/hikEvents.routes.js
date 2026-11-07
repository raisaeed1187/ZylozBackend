// src/routes/hikEvents.routes.js
// PUBLIC route (device cannot send a JWT). Protected by the long random token
// in the URL + device serial check inside usp_Hik_IngestEvent.

const express = require('express');
const multer = require('multer');
const { receiveEvent } = require('../controllers/hikEvents.controller');

const router = express.Router();

// Face events can include picture parts; keep in memory, ignore files.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 5, fields: 20 },
});

// POST /api/hik/events/:token
router.post('/events/:token', upload.any(), receiveEvent);

module.exports = router;
