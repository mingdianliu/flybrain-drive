import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('dist');
const mime = {
  '.html': 'text/html;charset=utf-8',
  '.css': 'text/css',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.bin': 'application/octet-stream',
  '.gz': 'application/octet-stream',
};
const server = http.createServer(async (req, res) => {
  try {
    const p = path.resolve(
      root,
      '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname),
    );
    if (p !== root && !p.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    const file = p === root ? path.join(root, 'index.html') : p;
    const b = await fs.readFile(file);
    res.writeHead(200, {
      'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(b);
  } catch {
    res.writeHead(404).end('Not found');
  }
});
server.listen(0, '127.0.0.1', () =>
  console.log('Local: http://127.0.0.1:' + server.address().port + '/'),
);
