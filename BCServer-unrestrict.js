#!/usr/bin/env node
const { execSync } = require('child_process');

try {
  require.resolve('busboy');
} catch {
  console.log('[INFO] Installing missing dependency: busboy...');
  execSync('npm install busboy', { stdio: 'inherit' });
}

const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const Busboy = require('busboy');

// === CONFIG ===
const PORT = 8000;
const STORAGE_DIR = path.join(__dirname, 'uploads');
// ================

// ensure storage dir
if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });

// find localhost IPv4 (127.0.0.1)
function getLocalhostIp() {
  // localhost is always 127.0.0.1, but just for formality:
  return '127.0.0.1';
}

const LOCAL_IP = getLocalhostIp();

function safeFileName(filename) {
  const base = path.basename(filename || 'file');
  const ts = Date.now();
  return `${ts}-${base.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
}

function listFiles() {
  return fs.readdirSync(STORAGE_DIR).filter(f => {
    const stat = fs.statSync(path.join(STORAGE_DIR, f));
    return stat.isFile();
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  // POST /upload - save files
  if (req.method === 'POST' && req.url === '/upload') {
    const busboy = new Busboy({ headers: req.headers });
    const savedFiles = [];

    busboy.on('file', (fieldname, fileStream, filename) => {
      const destName = safeFileName(filename);
      const saveTo = path.join(STORAGE_DIR, destName);
      const writeStream = fs.createWriteStream(saveTo);
      fileStream.pipe(writeStream);
      fileStream.on('end', () => {
        savedFiles.push({ field: fieldname, name: destName, original: filename });
      });
      writeStream.on('error', (err) => console.error('Write error:', err));
    });

    busboy.on('finish', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, files: savedFiles }));
    });

    req.pipe(busboy);
    return;
  }

  // GET /files - list files
  if (req.method === 'GET' && req.url === '/files') {
    const files = listFiles();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(files));
  }

  // GET /download/<filename> - download a file
  if (req.method === 'GET' && req.url.startsWith('/download/')) {
    const filename = decodeURIComponent(req.url.slice('/download/'.length));
    const safe = path.basename(filename);
    const filePath = path.join(STORAGE_DIR, safe);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${safe}"`,
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // GET / or /index.html - server info JSON
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      message: 'Local storage server (no auth, local only)',
      upload: `POST http://${LOCAL_IP}:${PORT}/upload`,
      files: `GET http://${LOCAL_IP}:${PORT}/files`,
      download: `GET http://${LOCAL_IP}:${PORT}/download/:filename`,
    }, null, 2));
  }

  // fallback 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

// listen only on localhost (127.0.0.1) to enforce local-only access
server.listen(PORT, LOCAL_IP, () => {
  console.log(`Local storage server listening at http://${LOCAL_IP}:${PORT}`);
  console.log(`Uploads saved to ${STORAGE_DIR}`);
});
