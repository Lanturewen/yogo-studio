'use strict';
// Exercise the delivered runtime and backend in isolated user data, without input hooks or HID writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');

async function main() {
  assert.ok(process.argv[2], 'Pass the packaged resources directory');
  const resources = path.resolve(process.argv[2]);
  if (process.platform === 'darwin') {
    const signature = spawnSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', path.resolve(resources, '..', '..')], {encoding:'utf8'});
    assert.equal(signature.status, 0, 'Packaged macOS signature is invalid: ' + signature.stderr);
  }
  const root = path.join(resources, 'app');
  const runtime = path.join(resources, 'runtime');
  const windows = process.platform === 'win32';
  const node = path.join(runtime, windows ? 'node.exe' : 'node');
  const helpers = windows ? ['audio-watch-windows.exe', 'codex-dial-windows.exe'] : ['audio-watch-macos', 'codex-dial-macos'];
  for (const file of ['ELECTRON-LICENSE.txt','CHROMIUM-LICENSES.html']) assert.ok(fs.statSync(path.join(runtime,'licenses',file)).size > 0, 'Missing Electron/Chromium license: '+file);
  for (const file of [node, ...helpers.map(name => path.join(runtime, name))]) {
    fs.accessSync(file, windows ? fs.constants.F_OK : fs.constants.X_OK);
  }
  for (const file of ['ui/model-source.js','ui/dial-model.js','ui/viewer.js','ui/THREE-LICENSE.txt','ui/CAMERA-CONTROLS-LICENSE.txt','ui/assets/yogo-pro-front.png','ui/assets/yogo-pro-controls.png','ui/assets/yogo-pro-underside.jpg','START_HERE.md','VALIDATION.md','AI_SETUP.md','VOICE.md']) assert.ok(fs.statSync(path.join(root,file)).size > 0, 'Missing model or user resource: '+file);
  for (const file of ['config.json', '.local']) assert.equal(fs.existsSync(path.join(root, file)), false, 'Packaged personal data: ' + file);
  const forbidden = new Set(['.git', '.local', '.env', 'runtime.json', 'keymap-backups', 'MAC_TEST_HANDOFF.md', 'HARDWARE_ACCEPTANCE.md', 'MAC_ACCEPTANCE_2026-09-18.md']);
  const inspect = directory => {
    for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
      assert.ok(!forbidden.has(entry.name) && !/\.(?:jsonl|log|pem|key|p12|pfx)$/i.test(entry.name), 'Unexpected private file in package: ' + path.relative(resources, path.join(directory,entry.name)));
      if (entry.isDirectory()) inspect(path.join(directory, entry.name));
    }
  };
  inspect(root);
  inspect(runtime);
  for (const file of ['ui/model-source.js','ui/dial-model.js','ui/viewer.js','ui/assets/yogo-pro-front.png','ui/assets/yogo-pro-controls.png','ui/assets/yogo-pro-underside.jpg']) {
    assert.deepEqual(fs.readFileSync(path.join(root,file)), fs.readFileSync(path.join(__dirname,'..',file)), 'Packaged model differs from build source: '+file);
  }
  const probe = spawnSync(node, ['-p', 'JSON.stringify({platform:process.platform,arch:process.arch})'], {encoding:'utf8', windowsHide:true});
  assert.equal(probe.status, 0, probe.stderr);
  const platform = JSON.parse(probe.stdout);
  assert.equal(platform.platform, process.platform);
  assert.equal(platform.arch, process.arch, 'Bundled Node architecture must match the build host');
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'yogo-package-smoke-'));
  const sessions = path.join(data, 'sessions');
  fs.mkdirSync(sessions);
  fs.writeFileSync(path.join(data, 'config.json'), JSON.stringify({port:0, scope:'global', sessionsRoot:sessions, voiceEnabled:false, codexDialEnabled:false}));
  let child, url, token, output = '';
  try {
    child = spawn(node, [path.join(root, 'player.cjs')], {cwd:root, windowsHide:true, env:{...process.env, YOGO_DATA_DIR:data, YOGO_RUNTIME_DIR:runtime, YOGO_PARENT_PID:String(process.pid)}, stdio:['ignore','pipe','pipe']});
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    let startError;
    child.on('error', error => { startError = error; });
    for (let i = 0; i < 100; i++) {
      if (startError) throw startError;
      assert.equal(child.exitCode, null, output);
      const match = output.match(/PLAYER (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) { url = match[1]; break; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(url, 'Packaged backend startup timed out: ' + output);
    const get = async route => {
      const response = await fetch(url + route, {signal:AbortSignal.timeout(5000)});
      assert.equal(response.status, 200, route);
      return response;
    };
    const status = await (await get('/status')).json();
    assert.equal(status.version, JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version);
    assert.equal(status.connection, null, 'Smoke check must not open a keyboard');
    const html = await (await get('/')).text();
    token = html.match(/const token='([a-f0-9]+)'/)?.[1];
    assert.ok(token);
    for (const route of ['/ui.css','/ui.js','/viewer.js','/assets/yogo-pro-front.png','/assets/yogo-pro-controls.png','/assets/yogo-pro-underside.jpg','/app-info']) await get(route);
    const preview = await (await get('/catalog-preview?id=done&ms=1100')).json();
    assert.equal(preview.pixels.length, 36);
    assert.equal(preview.keys.length, 84);
    console.log(JSON.stringify({result:'passed', version:status.version, ...platform, checks:['bundled runtime','native helper presence','no packaged personal data','isolated backend startup','UI and offline model resources','user documentation','read-only animation preview']}, null, 2));
  } finally {
    if (child?.pid && child.exitCode === null) {
      if (url && token) await fetch(url + '/shutdown', {method:'POST', headers:{'X-Player-Token':token}, signal:AbortSignal.timeout(3000)}).catch(() => {});
      for (let i = 0; i < 30 && child.exitCode === null; i++) await new Promise(resolve => setTimeout(resolve, 100));
      if (child.exitCode === null) {
        const exited = new Promise(resolve => child.once('exit', resolve));
        child.kill();
        await exited;
      }
    }
    fs.rmSync(data, {recursive:true, force:true});
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
