#!/usr/bin/env node

// Auto-install missing dependencies
const { execSync } = require('child_process');
const deps = ['busboy'];
for (const dep of deps) {
  try {
    require.resolve(dep);
  } catch (err) {
    console.log(`[INFO] Installing missing dependency: ${dep}...`);
    execSync(`npm install ${dep}`, { stdio: 'inherit' });
  }
}

const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const Busboy = require('busboy');

// === CONFIG ===
const PORT = 8000;
const USERNAME = 'admin';
const PASSWORD = '6gIsP101@server_d3f@ult';
const STORAGE_DIR = path.join(__dirname, 'uploads');
// ================

// ensure storage dir
if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });

// find a LAN IPv4 (private) address to bind to (so this is LAN-only)
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

function checkAuth(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) return false;
  const creds = Buffer.from(auth.split(' ')[1], 'base64').toString();
  const [user, pass] = creds.split(':');
  return user === USERNAME && pass === PASSWORD;
}

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
      'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    });
    return res.end();
  }

  if (!checkAuth(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="LAN Storage"' });
    return res.end('Authentication required');
  }

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

  if (req.method === 'GET' && req.url === '/files') {
    const files = listFiles();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(files));
  }

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

  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      message: 'LAN storage server',
      upload: `POST http://${LAN_IP}:${PORT}/upload`,
      files: `GET http://${LAN_IP}:${PORT}/files`,
      download: `GET http://${LAN_IP}:${PORT}/download/:filename`,
    }, null, 2));
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, LAN_IP, () => {
  console.log(`LAN storage server listening at http://${LAN_IP}:${PORT}`);
  console.log(`Uploads saved to ${STORAGE_DIR}`);
  console.log(`Auth -> user: ${USERNAME}`);
});
