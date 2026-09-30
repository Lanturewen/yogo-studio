'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AgentRegistry } = require('../agent-registry.cjs');

test('AgentRegistry: basic single session lifecycle', () => {
  const registry = new AgentRegistry();
  const t0 = 100000;

  // 1. Initial state is stopped
  assert.equal(registry.resolveGlobalState(t0).globalState, 'stopped');

  // 2. Pi starts turn -> busy
  const res1 = registry.update({ client: 'pi', sessionId: 's1', state: 'busy' }, t0);
  assert.equal(res1.globalState, 'busy');
  assert.equal(res1.active.busy, 1);
  assert.equal(res1.active.total, 1);

  // 3. Pi finishes -> done
  const res2 = registry.update({ client: 'pi', sessionId: 's1', state: 'done' }, t0 + 1000);
  assert.equal(res2.globalState, 'done');
  assert.equal(res2.active.done, 1);

  // 4. After done retention window (3500ms) -> pruned to stopped
  const res3 = registry.resolveGlobalState(t0 + 1000 + 3600);
  assert.equal(res3.globalState, 'stopped');
  assert.equal(res3.active.total, 0);

  // 5. Explicit stop clears immediately
  registry.update({ client: 'pi', sessionId: 's2', state: 'busy' }, t0);
  assert.equal(registry.resolveGlobalState(t0).globalState, 'busy');
  const resStop = registry.update({ client: 'pi', sessionId: 's2', state: 'stopped' }, t0 + 100);
  assert.equal(resStop.globalState, 'stopped');
  assert.equal(resStop.active.total, 0);
});

test('AgentRegistry: priority arbitration (waiting > busy > error > done)', () => {
  const registry = new AgentRegistry();
  const t0 = 100000;

  // Pi is busy running a script
  registry.update({ client: 'pi', sessionId: 'pi-1', state: 'busy' }, t0);
  assert.equal(registry.resolveGlobalState(t0).globalState, 'busy');

  // Claude requests tool permission -> waiting
  // Waiting must immediately trump busy!
  const resWait = registry.update({ client: 'claude', sessionId: 'claude-1', state: 'waiting' }, t0 + 200);
  assert.equal(resWait.globalState, 'waiting', 'waiting must override busy');
  assert.equal(resWait.active.waiting, 1);
  assert.equal(resWait.active.busy, 1);

  // User confirms in Claude -> Claude becomes busy
  // Global state falls back to busy seamlessly
  const resResume = registry.update({ client: 'claude', sessionId: 'claude-1', state: 'busy' }, t0 + 1000);
  assert.equal(resResume.globalState, 'busy', 'resuming from waiting must return to busy');
  assert.equal(resResume.active.waiting, 0);
  assert.equal(resResume.active.busy, 2);

  // Pi finishes first -> done
  // Because Claude is still busy, global state MUST remain busy (not done!)
  const resPiDone = registry.update({ client: 'pi', sessionId: 'pi-1', state: 'done' }, t0 + 2000);
  assert.equal(resPiDone.globalState, 'busy', 'done must NOT override another busy session');
  assert.equal(resPiDone.active.busy, 1);
  assert.equal(resPiDone.active.done, 1);

  // Now Claude finishes too -> done
  // All busy sessions ended, now show done
  const resAllDone = registry.update({ client: 'claude', sessionId: 'claude-1', state: 'done' }, t0 + 3000);
  assert.equal(resAllDone.globalState, 'done');
  assert.equal(resAllDone.active.busy, 0);
  assert.equal(resAllDone.active.done, 2);
});

test('AgentRegistry: error state priority', () => {
  const registry = new AgentRegistry();
  const t0 = 100000;

  // Error alone shows error
  registry.update({ client: 'pi', sessionId: 's1', state: 'error' }, t0);
  assert.equal(registry.resolveGlobalState(t0).globalState, 'error');

  // But busy trumps error
  registry.update({ client: 'claude', sessionId: 's2', state: 'busy' }, t0);
  assert.equal(registry.resolveGlobalState(t0).globalState, 'busy');

  // Waiting trumps both error and busy
  registry.update({ client: 'codex', sessionId: 's3', state: 'waiting' }, t0);
  assert.equal(registry.resolveGlobalState(t0).globalState, 'waiting');
});

test('AgentRegistry: TTL lease and heartbeat auto-expiration', () => {
  const registry = new AgentRegistry({ defaultTtlMs: 5000 });
  const t0 = 100000;

  // Agent crashes without sending stopped (custom TTL = 3000ms)
  registry.update({ client: 'crashed-agent', sessionId: 'dead-pid', state: 'busy', ttlMs: 3000 }, t0);
  assert.equal(registry.resolveGlobalState(t0).globalState, 'busy');

  // 2 seconds later, still within TTL
  assert.equal(registry.resolveGlobalState(t0 + 2000).globalState, 'busy');

  // 3.1 seconds later, expired! Auto-pruned to stopped
  const expiredRes = registry.resolveGlobalState(t0 + 3100);
  assert.equal(expiredRes.globalState, 'stopped');
  assert.equal(expiredRes.active.total, 0);

  // Heartbeat refresh keeps it alive
  registry.update({ client: 'long-agent', sessionId: 'long-pid', state: 'busy', ttlMs: 3000 }, t0);
  // Send heartbeat at t0 + 2000
  registry.update({ client: 'long-agent', sessionId: 'long-pid', state: 'busy', ttlMs: 3000 }, t0 + 2000);
  // At t0 + 4000, without heartbeat it would have expired (4000 > 3000), but heartbeat refreshed it until t0+5000
  assert.equal(registry.resolveGlobalState(t0 + 4000).globalState, 'busy');
});

test('AgentRegistry: setDoneRetentionMs dynamically updates done expiry', () => {
  const registry = new AgentRegistry();
  const t0 = 100000;

  // Custom done retention = 8000ms
  registry.setDoneRetentionMs(8000);
  registry.update({ client: 'pi', sessionId: 's1', state: 'done' }, t0);

  // At t0 + 5000, without update it would have expired (3500 default), but now survives
  assert.equal(registry.resolveGlobalState(t0 + 5000).globalState, 'done');

  // At t0 + 8100, expires
  assert.equal(registry.resolveGlobalState(t0 + 8100).globalState, 'stopped');
});

test('AgentRegistry: input validation rejects malicious/invalid payloads', () => {
  const registry = new AgentRegistry();

  assert.throws(() => registry.update(null), /must be an object/);
  assert.throws(() => registry.update({}), /Invalid client/);
  assert.throws(() => registry.update({ client: '', sessionId: '1', state: 'busy' }), /Invalid client/);
  assert.throws(() => registry.update({ client: 'a'.repeat(65), sessionId: '1', state: 'busy' }), /Invalid client/);
  assert.throws(() => registry.update({ client: 'pi', sessionId: '', state: 'busy' }), /Invalid sessionId/);
  assert.throws(() => registry.update({ client: 'pi', sessionId: '1', state: 'unknown' }), /Invalid state/);
  assert.throws(() => registry.update({ client: 'pi', sessionId: '1', state: 'busy', ttlMs: 500 }), /Invalid ttlMs/);
  assert.throws(() => registry.update({ client: 'pi', sessionId: '1', state: 'busy', ttlMs: 9999999 }), /Invalid ttlMs/);
});
