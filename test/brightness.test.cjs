'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');

test('brightness: settings validation, player integration, and cli.cjs brightness control', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yogo-brightness-test-'));
  let child, url, token;

  fs.mkdirSync(path.join(dir, 'sessions'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
    port: 0,
    voiceEnabled: false,
    codexDialEnabled: false,
    brightness: 80,
    sessionsRoot: path.join(dir, 'sessions')
  }));

  // 1. Settings logic test
  process.env.YOGO_DATA_DIR = dir;
  const settings = require('../settings.cjs');
  assert.equal(settings.read().brightness, 80);

  assert.throws(() => settings.validatePatch({ brightness: 3 }), /亮度需在 5–100 之间/);
  assert.throws(() => settings.validatePatch({ brightness: 105 }), /亮度需在 5–100 之间/);
  assert.throws(() => settings.validatePatch({ brightness: '50' }), /亮度需在 5–100 之间/);

  settings.savePatch({ brightness: 50 });
  assert.equal(settings.read().brightness, 50);

  // 2. Launch player.cjs and test HTTP API
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
  const post = (route, data) => fetch(url + route, {
    method: 'POST',
    headers: { 'X-Player-Token': token, 'Content-Type': 'application/json' },
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

    // Check initial brightness in status and app-info
    const status1 = await get('/status');
    assert.equal(status1.brightness, 50);

    const appInfo1 = await get('/app-info');
    assert.equal(appInfo1.settings.brightness, 50);

    // Update brightness via HTTP POST /settings
    const updateRes = await post('/settings', { brightness: 30 });
    assert.equal(updateRes.status, 200);

    const status2 = await get('/status');
    assert.equal(status2.brightness, 30);

    // Test cli.cjs brightness command
    const cliOutput = execFileSync(
      process.execPath,
      [path.join(root, 'cli.cjs'), 'brightness', '45'],
      { env: { ...process.env, YOGO_DATA_DIR: dir }, encoding: 'utf8' }
    );
    const cliJson = JSON.parse(cliOutput.trim());
    assert.equal(cliJson.ok, true);
    assert.equal(cliJson.brightness, 45);

    const status3 = await get('/status');
    assert.equal(status3.brightness, 45);
  } finally {
    try { await close(); } finally {
      child?.kill();
      delete process.env.YOGO_DATA_DIR;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});
