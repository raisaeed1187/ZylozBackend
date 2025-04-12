const express = require('express');
const router = express.Router();
const cors = require("cors");
const authenticateToken = require('./middleware');   
const multer = require("multer");
const {orgProfileSaveUpdate} = require('../controllers/profileController'); 



router.get('/users', orgProfileSaveUpdate);
