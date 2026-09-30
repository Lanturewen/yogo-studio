'use strict';

const VALID_STATES = new Set(['waiting', 'busy', 'error', 'done', 'stopped']);
const DEFAULT_TTL_MS = 15000;
const MIN_TTL_MS = 1000;
const MAX_TTL_MS = 300000;
const DONE_RETENTION_MS = 3500;

class AgentRegistry {
  constructor(options = {}) {
    this.defaultTtlMs = options.defaultTtlMs || DEFAULT_TTL_MS;
    this.doneRetentionMs = options.doneRetentionMs || DONE_RETENTION_MS;
    this.sessions = new Map();
  }

  setDoneRetentionMs(ms) {
    if (typeof ms === 'number' && Number.isFinite(ms) && ms >= MIN_TTL_MS && ms <= MAX_TTL_MS) {
      this.doneRetentionMs = ms;
    }
  }

  static validateInput(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('Invalid agent status payload: must be an object');
    }
    const { client, sessionId, state } = input;
    if (typeof client !== 'string' || !client.trim() || client.length > 64) {
      throw new Error('Invalid client: non-empty string <= 64 chars required');
    }
    if (typeof sessionId !== 'string' || !sessionId.trim() || sessionId.length > 128) {
      throw new Error('Invalid sessionId: non-empty string <= 128 chars required');
    }
    if (!VALID_STATES.has(state)) {
      throw new Error(`Invalid state "${state}": must be one of ${[...VALID_STATES].join(', ')}`);
    }
    let ttlMs = input.ttlMs;
    if (ttlMs !== undefined) {
      if (typeof ttlMs !== 'number' || !Number.isFinite(ttlMs) || ttlMs < MIN_TTL_MS || ttlMs > MAX_TTL_MS) {
        throw new Error(`Invalid ttlMs: must be a number between ${MIN_TTL_MS} and ${MAX_TTL_MS}`);
      }
    }
    return {
      client: client.trim(),
      sessionId: sessionId.trim(),
      state,
      turnId: typeof input.turnId === 'string' ? input.turnId.slice(0, 128) : undefined,
      ttlMs
    };
  }

  key(client, sessionId) {
    return `${client}:${sessionId}`;
  }

  update(rawInput, now = Date.now()) {
    const valid = AgentRegistry.validateInput(rawInput);
    const k = this.key(valid.client, valid.sessionId);

    if (valid.state === 'stopped') {
      this.sessions.delete(k);
    } else {
      const ttl = valid.state === 'done'
        ? Math.min(valid.ttlMs || this.doneRetentionMs, this.doneRetentionMs)
        : (valid.ttlMs || this.defaultTtlMs);

      this.sessions.set(k, {
        client: valid.client,
        sessionId: valid.sessionId,
        state: valid.state,
        turnId: valid.turnId,
        lastSeen: now,
        expiresAt: now + ttl
      });
    }

    return this.resolveGlobalState(now);
  }

  remove(client, sessionId) {
    return this.sessions.delete(this.key(client, sessionId));
  }

  clear() {
    this.sessions.clear();
  }

  prune(now = Date.now()) {
    for (const [k, session] of this.sessions) {
      if (now >= session.expiresAt) {
        this.sessions.delete(k);
      }
    }
  }

  resolveGlobalState(now = Date.now()) {
    this.prune(now);

    const counts = { waiting: 0, busy: 0, error: 0, done: 0, total: this.sessions.size };
    for (const session of this.sessions.values()) {
      if (counts[session.state] !== undefined) {
        counts[session.state]++;
      }
    }

    let globalState = 'stopped';
    if (counts.waiting > 0) {
      globalState = 'waiting';
    } else if (counts.busy > 0) {
      globalState = 'busy';
    } else if (counts.error > 0) {
      globalState = 'error';
    } else if (counts.done > 0) {
      globalState = 'done';
    }

    return {
      globalState,
      active: counts,
      sessions: [...this.sessions.values()].map(s => ({
        client: s.client,
        sessionId: s.sessionId,
        state: s.state,
        turnId: s.turnId,
        expiresInMs: Math.max(0, s.expiresAt - now)
      }))
    };
  }
}

module.exports = {
  AgentRegistry,
  VALID_STATES,
  DEFAULT_TTL_MS,
  DONE_RETENTION_MS
};
