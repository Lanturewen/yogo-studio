'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');

test('agent API: /agent-status route, token authentication, and multi-agent follow integration', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yogo-agent-api-'));
  let child, url, token;

  fs.mkdirSync(path.join(dir, 'sessions'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
    port: 0,
    voiceEnabled: false,
    codexDialEnabled: false,
    sessionsRoot: path.join(dir, 'sessions')
  }));

  async function launch() {
    child = spawn(process.execPath, [path.join(root, 'player.cjs')], {
      env: { ...process.env, YOGO_DATA_DIR: dir },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    url = await new Promise((resolve, reject) => {
      let out = '';
      const timer = setTimeout(() => reject(Error('Server start timeout')), 7000);
      child.stdout.on('data', d => {
        out += d;
        const match = out.match(/PLAYER (http:\/\/127\.0\.0\.1:\d+)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });
      child.on('error', reject);
      child.on('exit', code => {
        clearTimeout(timer);
        reject(Error('Server exit ' + code));
      });
    });
    const html = await (await fetch(url)).text();
    token = html.match(/const token='([a-f0-9]+)'/)[1];
  }

  const get = route => fetch(url + route).then(r => r.json());
  const post = (route, data, headers = {}) => fetch(url + route, {
    method: 'POST',
    headers: { 'X-Player-Token': token, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data)
  });

  async function close() {
    const running = child;
    if (!running || running.exitCode !== null) return;
    const exited = new Promise(resolve => running.once('exit', resolve));
    await post('/shutdown', {});
    await exited;
    child = null;
  }

  try {
    await launch();

    // 1. Auth security: missing or wrong token rejected with 403
    const unauthorized = await post('/agent-status', { client: 'pi', sessionId: 's1', state: 'busy' }, { 'X-Player-Token': 'wrong' });
    assert.equal(unauthorized.status, 403);

    // 2. Successful report from Pi: state=busy
    const piRes = await post('/agent-status', { client: 'pi', sessionId: 's1', state: 'busy' });
    assert.equal(piRes.status, 200);
    const piData = await piRes.json();
    assert.equal(piData.ok, true);
    assert.equal(piData.globalState, 'busy');
    assert.equal(piData.active.busy, 1);

    // Verify /status reflects the follow state
    const status1 = await get('/status');
    assert.equal(status1.follow.state, 'busy');
    assert.equal(status1.agents.active.busy, 1);

    // 3. Claude joins with waiting (permission request)
    const claudeRes = await post('/agent-status', { client: 'claude', sessionId: 'c1', state: 'waiting' });
    assert.equal(claudeRes.status, 200);
    const claudeData = await claudeRes.json();
    assert.equal(claudeData.globalState, 'waiting', 'waiting overrides busy');
    assert.equal(claudeData.active.waiting, 1);
    assert.equal(claudeData.active.busy, 1);

    const status2 = await get('/status');
    assert.equal(status2.follow.state, 'waiting');

    // 4. Test cli.cjs report command
    const cliOutput = execFileSync(
      process.execPath,
      [path.join(root, 'cli.cjs'), 'report', '--client', 'claude', '--session', 'c1', '--state', 'busy'],
      { env: { ...process.env, YOGO_DATA_DIR: dir }, encoding: 'utf8' }
    );
    const cliJson = JSON.parse(cliOutput.trim());
    assert.equal(cliJson.ok, true);
    assert.equal(cliJson.globalState, 'busy');
    assert.equal(cliJson.active.waiting, 0);
    assert.equal(cliJson.active.busy, 2);

    // 5. Pi completes first -> done. Because Claude is busy, overall follow is still busy!
    await post('/agent-status', { client: 'pi', sessionId: 's1', state: 'done' });
    const status3 = await get('/status');
    assert.equal(status3.follow.state, 'busy');

    // 6. Claude completes -> now all busy sessions are done
    await post('/agent-status', { client: 'claude', sessionId: 'c1', state: 'done' });
    const status4 = await get('/status');
    assert.equal(status4.follow.state, 'done');

    // 7. Explicit stopped clears
    await post('/agent-status', { client: 'pi', sessionId: 's1', state: 'stopped' });
    await post('/agent-status', { client: 'claude', sessionId: 'c1', state: 'stopped' });
    const status5 = await get('/status');
    assert.equal(status5.follow.state, 'stopped');
  } finally {
    try { await close(); } finally { child?.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
  }
});
