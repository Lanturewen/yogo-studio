#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Safe exit helper
function exitOk() {
  process.exit(0);
}

// Locate YOGO Studio runtime.json
function findRuntime() {
  const candidates = [
    process.env.YOGO_DATA_DIR ? path.join(process.env.YOGO_DATA_DIR, '.local/runtime.json') : null,
    path.join(os.homedir(), 'Library/Application Support/YOGO Studio/.local/runtime.json'),
    path.join(os.homedir(), 'WorkSpace/yogo-studio/.local/runtime.json'),
    path.join(process.cwd(), '.local/runtime.json')
  ].filter(Boolean);

  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const info = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (info && /^http:\/\/127\.0\.0\.1:\d+$/.test(info.url)) {
          return info;
        }
      }
    } catch {}
  }
  return null;
}

// Fetch player token
async function getToken(url) {
  try {
    const signal = AbortSignal.timeout(1000);
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/const token=['"]([^'"]+)['"]/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// Map Claude Code hook event to agent state
function mapEventToState(eventName) {
  switch (eventName) {
    case 'UserPromptSubmit':
      return 'busy';
    case 'PermissionRequest':
      return 'waiting';
    case 'PostToolUse':
    case 'PostToolUseFailure':
      return 'busy';
    case 'Stop':
      return 'done';
    case 'SessionEnd':
      return 'stopped';
    default:
      return null;
  }
}

async function report(sessionId, state) {
  if (!state) return;
  const runtime = findRuntime();
  if (!runtime) return;

  const token = await getToken(runtime.url);
  if (!token) return;

  const signal = AbortSignal.timeout(1200);
  await fetch(`${runtime.url}/agent-status`, {
    method: 'POST',
    headers: {
      'X-Player-Token': token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client: 'claude',
      sessionId: String(sessionId || `claude-${process.ppid}`),
      state,
      ttlMs: 15000
    }),
    signal
  });
}

async function main() {
  const deadline = setTimeout(exitOk, 2000);

  // 1. Check CLI arguments
  const args = process.argv.slice(2);
  let explicitState = null;
  let explicitSession = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--state' && args[i + 1]) {
      explicitState = args[i + 1];
      i++;
    } else if (args[i] === '--session' && args[i + 1]) {
      explicitSession = args[i + 1];
      i++;
    }
  }

  if (explicitState) {
    try {
      await report(explicitSession, explicitState);
    } catch {}
    clearTimeout(deadline);
    process.exitCode = 0;
    return;
  }

  // 2. Read stdin if passed from Claude Code hook
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    input += chunk;
    if (input.length > 512 * 1024) process.exit(0);
  });

  process.stdin.on('end', () => {
    Promise.resolve().then(async () => {
      if (input.trim()) {
        const payload = JSON.parse(input);
        const eventName = payload.hook_event_name || payload.type || payload.event;
        const targetState = mapEventToState(eventName);
        const sessionId = payload.session_id || payload.sessionId || `claude-${process.ppid || 'agent'}`;
        if (targetState) {
          await report(sessionId, targetState);
        }
      }
    }).catch(() => {}).finally(() => {
      clearTimeout(deadline);
      process.exitCode = 0;
    });
  });

  process.stdin.on('error', () => {
    process.exitCode = 0;
  });
}

if (require.main === module) {
  main().catch(exitOk);
}

module.exports = { mapEventToState, report, findRuntime };
