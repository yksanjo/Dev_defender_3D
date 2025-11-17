import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const server = createServer((req, res) => {
  let filePath = join(__dirname, 'dist', req.url === '/' ? 'index.html' : req.url);
  
  const ext = filePath.substring(filePath.lastIndexOf('.'));
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  if (!existsSync(filePath) || filePath.indexOf(join(__dirname, 'dist')) !== 0) {
    filePath = join(__dirname, 'dist', 'index.html');
  }

  try {
    const content = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content, 'utf-8');
  } catch (error) {
    res.writeHead(500);
    res.end(`Server Error: ${error.code}`);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Dev Defender 3D server running on port ${PORT}`);
});


