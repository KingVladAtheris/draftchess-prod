import { createServer } from 'http';

export function startHealthServer(port = 3003) {
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200).end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    } else res.writeHead(404).end();
  });
  server.listen(port);
  console.log(`[health] listening on :${port}`);
}