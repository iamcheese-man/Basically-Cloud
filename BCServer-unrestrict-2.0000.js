const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ====================
// CONFIG
// ====================
const config = {
    port: 3000,                      // Server port
    storagePath: 'E:/cloud_storage', // USB storage folder path
    checkInterval: 2000              // USB check interval in ms
};

// ====================
// SERVER SETUP
// ====================
const app = express();
let storageAvailable = false;

// Check if USB storage exists
function checkStorage() {
    storageAvailable = fs.existsSync(config.storagePath);
    if (!storageAvailable) {
        console.log('USB storage not available. Waiting for it to be plugged in...');
    } else {
        console.log('USB storage detected.');
    }
}

// Initial check
checkStorage();

// Poll USB status periodically
setInterval(checkStorage, config.checkInterval);

// ====================
// MULTER SETUP
// ====================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!storageAvailable) return cb(new Error('USB storage not available'));
        cb(null, config.storagePath);
    },
    filename: (req, file, cb) => cb(null, file.originalname)
});

// No limits: completely unrestricted
const upload = multer({ storage });

// ====================
// ROUTES
// ====================

// Upload file
app.post('/upload', upload.single('file'), (req, res) => {
    if (!storageAvailable) return res.status(503).send('USB storage not available');
    res.send('File uploaded successfully!');
});

// List files
app.get('/files', (req, res) => {
    if (!storageAvailable) return res.status(503).send('USB storage not available');
    fs.readdir(config.storagePath, (err, files) => {
        if (err) return res.status(500).send('Error reading files');
        res.json(files);
    });
});

// Download file
app.get('/files/:filename', (req, res) => {
    if (!storageAvailable) return res.status(503).send('USB storage not available');
    const filePath = path.join(config.storagePath, req.params.filename);
    fs.access(filePath, fs.constants.F_OK, err => {
        if (err) return res.status(404).send('File not found');
        res.download(filePath);
    });
});

// ====================
// START SERVER
// ====================
app.listen(config.port, () => {
    console.log(`USB Cloud running at http://localhost:${config.port}`);
});
