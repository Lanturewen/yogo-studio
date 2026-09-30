'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('Pi Extension: lifecycle events map to /agent-status with correct states', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yogo-pi-ext-test-'));
  const receivedRequests = [];
  const testToken = 'abcdef1234567890abcdef1234567890';

  // 1. Mock YOGO Studio server
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><script>const token='${testToken}';</script></html>`);
      return;
    }
    if (req.method === 'POST' && req.url === '/agent-status') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        receivedRequests.push({
          token: req.headers['x-player-token'],
          body: JSON.parse(body)
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, globalState: JSON.parse(body).state }));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}`;

  fs.mkdirSync(path.join(dir, '.local'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.local/runtime.json'), JSON.stringify({ port, url, pid: process.pid }));

  try {
    // 2. Load extension in mock environment
    process.env.YOGO_DATA_DIR = dir;

    const handlers = new Map();
    const mockPi = {
      on(event, handler) {
        handlers.set(event, handler);
      }
    };

    // Since yogo-status is written in TS/ESM-compatible syntax, we can transpile or test its logic
    // We create a mock context
    const mockCtx = {
      sessionManager: {
        getSessionFile: () => '/path/to/my-pi-session.jsonl'
      }
    };

    const esbuild = require('esbuild');
    const tsCode = fs.readFileSync(path.join(__dirname, '../extensions/pi/yogo-status.ts'), 'utf8');
    const jsCode = esbuild.transformSync(tsCode, { loader: 'ts', format: 'cjs' }).code;

    const tempCjs = path.join(dir, 'temp-ext.cjs');
    fs.writeFileSync(tempCjs, jsCode);

    const factory = require(tempCjs).default;
    factory(mockPi);

    // 3. Fire turn_start
    handlers.get('turn_start')({ turnIndex: 1 }, mockCtx);
    await new Promise(r => setTimeout(r, 100));

    // 4. Fire ui_prompt_start (waiting)
    handlers.get('ui_prompt_start')({}, mockCtx);
    await new Promise(r => setTimeout(r, 100));

    // 5. Fire ui_prompt_end (back to busy)
    handlers.get('ui_prompt_end')({}, mockCtx);
    await new Promise(r => setTimeout(r, 100));

    // 6. Fire turn_end (done)
    handlers.get('turn_end')({ turnIndex: 1 }, mockCtx);
    await new Promise(r => setTimeout(r, 100));

    // 7. Fire session_shutdown (stopped)
    handlers.get('session_shutdown')({}, mockCtx);
    await new Promise(r => setTimeout(r, 100));

    // 8. Assert received requests
    assert.equal(receivedRequests.length, 5);
    assert.deepEqual(receivedRequests.map(r => r.body.state), [
      'busy',
      'waiting',
      'busy',
      'done',
      'stopped'
    ]);

    for (const r of receivedRequests) {
      assert.equal(r.token, testToken);
      assert.equal(r.body.client, 'pi');
      assert.equal(r.body.sessionId, 'my-pi-session.jsonl');
    }
  } finally {
    server.close();
    delete process.env.YOGO_DATA_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Pi Extension: automatically retries upon 403 token expiration', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yogo-pi-retry-test-'));
  let currentToken = 'token_v1_111111111111111111111111';
  const receivedBodies = [];

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><script>const token='${currentToken}';</script></html>`);
      return;
    }
    if (req.method === 'POST' && req.url === '/agent-status') {
      const token = req.headers['x-player-token'];
      if (token !== currentToken) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden' }));
        return;
      }
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        receivedBodies.push(JSON.parse(body));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}`;

  fs.mkdirSync(path.join(dir, '.local'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.local/runtime.json'), JSON.stringify({ port, url, pid: process.pid }));

  try {
    process.env.YOGO_DATA_DIR = dir;
    const handlers = new Map();
    const mockPi = { on(event, handler) { handlers.set(event, handler); } };
    const mockCtx = { sessionManager: { getSessionFile: () => 'test-session.jsonl' } };

    const esbuild = require('esbuild');
    const tsCode = fs.readFileSync(path.join(__dirname, '../extensions/pi/yogo-status.ts'), 'utf8');
    const jsCode = esbuild.transformSync(tsCode, { loader: 'ts', format: 'cjs' }).code;
    const tempCjs = path.join(dir, 'temp-ext.cjs');
    fs.writeFileSync(tempCjs, jsCode);

    const factory = require(tempCjs).default;
    factory(mockPi);

    // Initial event primes token_v1
    handlers.get('turn_start')({ turnIndex: 1 }, mockCtx);
    await new Promise(r => setTimeout(r, 100));
    assert.equal(receivedBodies.length, 1);

    // Daemon restarts! New token generated
    currentToken = 'token_v2_222222222222222222222222';

    // Next event triggers 403, but extension must catch it, refresh token and retry
    handlers.get('ui_prompt_start')({}, mockCtx);
    await new Promise(r => setTimeout(r, 150));

    // Must have successfully retried with the new token
    assert.equal(receivedBodies.length, 2);
    assert.equal(receivedBodies[1].state, 'waiting');

    // Clean up
    handlers.get('session_shutdown')({}, mockCtx);
    await new Promise(r => setTimeout(r, 50));
  } finally {
    server.close();
    delete process.env.YOGO_DATA_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
