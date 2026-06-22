// Minimal local dev server that serves the static site and routes /api/* requests
// to the same handler files Vercel will use in production. Lets us test against
// Neon locally without needing `vercel login`. Not used in production.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const http = require('http');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

async function handleApi(req, res, apiPath) {
  const modulePath = path.join(ROOT, 'api', `${apiPath}.js`);
  if (!fs.existsSync(modulePath)) {
    return send(res, 404, JSON.stringify({ error: 'Not found' }), { 'Content-Type': 'application/json' });
  }

  delete require.cache[require.resolve(modulePath)];
  const handler = require(modulePath);
  const skipBodyParse = handler.config && handler.config.api && handler.config.api.bodyParser === false;

  if (!skipBodyParse) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    req.body = raw ? JSON.parse(raw) : {};
  }

  const jsonRes = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(key, value) {
      res.setHeader(key, value);
      return this;
    },
    json(payload) {
      res.writeHead(this.statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    },
  };

  try {
    await handler(req, jsonRes);
  } catch (err) {
    console.error(`API handler error for ${apiPath}:`, err);
    send(res, 500, JSON.stringify({ error: 'Internal server error' }), { 'Content-Type': 'application/json' });
  }
}

function serveStatic(req, res) {
  let filePath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  filePath = path.join(ROOT, filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      return send(res, 404, 'Not found');
    }
    const ext = path.extname(filePath);
    send(res, 200, data, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    const apiPath = req.url.replace('/api/', '').split('?')[0];
    handleApi(req, res, apiPath);
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Local dev server running at http://localhost:${PORT}`);
});
