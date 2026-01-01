const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');

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

// Find LAN IPv4 address
function getLanIp() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                if (
                    net.address.startsWith('10.') ||
                    net.address.startsWith('172.') ||
                    net.address.startsWith('192.168.')
                ) {
                    return net.address;
                }
            }
        }
    }
    return null;
}

const LAN_IP = getLanIp();
if (!LAN_IP) {
    console.error('No LAN IPv4 address found. Make sure you are on a LAN. Exiting.');
    process.exit(1);
}

// USB detection
function checkStorage() {
    storageAvailable = fs.existsSync(config.storagePath);
    if (!storageAvailable) {
        console.log('USB storage not available. Waiting for it to be plugged in...');
    } else {
        console.log('USB storage detected.');
    }
}

checkStorage();
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

const upload = multer({ storage });

// ====================
// CORS MIDDLEWARE
// ====================
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

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
app.listen(config.port, LAN_IP, () => {
    console.log(`USB Cloud running at http://${LAN_IP}:${config.port}`);
});
