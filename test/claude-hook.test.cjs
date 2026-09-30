'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { mapEventToState } = require('../scripts/claude-hook.cjs');

test('Claude Hook: mapEventToState correctly maps lifecycle events', () => {
  assert.equal(mapEventToState('UserPromptSubmit'), 'busy');
  assert.equal(mapEventToState('PermissionRequest'), 'waiting');
  assert.equal(mapEventToState('PostToolUse'), 'busy');
  assert.equal(mapEventToState('PostToolUseFailure'), 'busy');
  assert.equal(mapEventToState('Stop'), 'done');
  assert.equal(mapEventToState('SessionEnd'), 'stopped');
  assert.equal(mapEventToState('UnknownEvent'), null);
});

test('Claude Hook: executes with stdin and CLI arguments against mock server', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yogo-claude-ext-test-'));
  const receivedRequests = [];
  const testToken = 'abcdef1234567890abcdef1234567890';

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

  const scriptPath = path.join(__dirname, '../scripts/claude-hook.cjs');

  function runScript(args, stdinInput) {
    return new Promise((resolve, reject) => {
      const stdio = stdinInput ? ['pipe', 'ignore', 'ignore'] : ['ignore', 'ignore', 'ignore'];
      const child = spawn(process.execPath, [scriptPath, ...args], {
        env: { ...process.env, YOGO_DATA_DIR: dir },
        stdio
      });
      if (stdinInput) {
        child.stdin.end(stdinInput);
      }
      child.on('error', reject);
      child.on('exit', code => resolve(code));
    });
  }

  try {
    // 1. Test via stdin with PermissionRequest event
    const stdinPayload = JSON.stringify({
      hook_event_name: 'PermissionRequest',
      session_id: 'claude-session-abc',
      tool_name: 'Bash'
    });

    const code1 = await runScript([], stdinPayload);
    assert.equal(code1, 0);

    // 2. Test via CLI arguments
    const code2 = await runScript(['--state', 'done', '--session', 'claude-session-abc']);
    assert.equal(code2, 0);

    // 3. Verify received requests
    assert.equal(receivedRequests.length, 2);
    assert.equal(receivedRequests[0].token, testToken);
    assert.equal(receivedRequests[0].body.client, 'claude');
    assert.equal(receivedRequests[0].body.sessionId, 'claude-session-abc');
    assert.equal(receivedRequests[0].body.state, 'waiting');

    assert.equal(receivedRequests[1].body.state, 'done');

    // 4. Test failure tolerance: if server unreachable, must still exit 0
    const code3 = await new Promise((resolve) => {
      const child = spawn(process.execPath, [scriptPath, '--state', 'busy'], {
        env: { ...process.env, YOGO_DATA_DIR: '/nonexistent/path' },
        stdio: ['ignore', 'ignore', 'ignore']
      });
      child.on('exit', resolve);
    });
    assert.equal(code3, 0, 'Must exit 0 even if server offline');
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
