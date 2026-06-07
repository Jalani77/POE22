const http = require('http');
const fs = require('fs');
const path = require('path');
const { discoverContacts } = require('./jarvis/agent');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = __dirname;
const MAX_BODY_BYTES = 1024 * 64;

const CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

function sendJson(res, status, payload) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload, null, 2));
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
                reject(new Error('Request body is too large.'));
                req.destroy();
            }
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch {
                reject(new Error('Request body must be valid JSON.'));
            }
        });
        req.on('error', reject);
    });
}

function safeStaticPath(urlPath) {
    const requested = urlPath === '/' ? '/starter.html' : urlPath;
    const decoded = decodeURIComponent(requested.split('?')[0]);
    const filePath = path.normalize(path.join(PUBLIC_DIR, decoded));
    if (!filePath.startsWith(PUBLIC_DIR)) return '';
    return filePath;
}

function serveStatic(req, res) {
    const filePath = safeStaticPath(req.url);
    if (!filePath) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            res.writeHead(error.code === 'ENOENT' ? 404 : 500);
            res.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'content-type': CONTENT_TYPES[ext] || 'application/octet-stream' });
        res.end(content);
    });
}

async function handleJarvis(req, res) {
    try {
        const body = await readJsonBody(req);
        if (!body.website && !body.name) {
            sendJson(res, 400, { error: 'Provide a website, a name, or both.' });
            return;
        }

        const result = await discoverContacts({
            name: String(body.name || ''),
            website: String(body.website || ''),
            reason: String(body.reason || '')
        });
        sendJson(res, 200, result);
    } catch (error) {
        sendJson(res, 500, { error: error.message });
    }
}

const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/jarvis') {
        handleJarvis(req, res);
        return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
        serveStatic(req, res);
        return;
    }

    res.writeHead(405, { allow: 'GET, HEAD, POST' });
    res.end('Method not allowed');
});

if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`PantherOnlyEats server running at http://localhost:${PORT}`);
        console.log('Jarvis API available at POST /api/jarvis');
    });
}

module.exports = server;
