import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

interface RuntimeInfo {
  url: string;
  port: number;
  pid: number;
}

type AgentState = "waiting" | "busy" | "error" | "done" | "stopped";

const HEARTBEAT_INTERVAL_MS = 5000;
const SESSION_TTL_MS = 15000;

export default function (pi: ExtensionAPI) {
  let cachedToken: string | null = null;
  let cachedRuntime: RuntimeInfo | null = null;
  let lastCheckTime = 0;
  let isAgentRunning = false;
  let hasActivePrompt = false;
  let heartbeatTimer: NodeJS.Timeout | null = null;

  // 1. Locate YOGO Studio runtime.json
  function getRuntimeInfo(): RuntimeInfo | null {
    const now = Date.now();
    if (cachedRuntime && now - lastCheckTime < 5000) {
      return cachedRuntime;
    }
    lastCheckTime = now;

    const candidates = [
      process.env.YOGO_DATA_DIR ? path.join(process.env.YOGO_DATA_DIR, ".local/runtime.json") : null,
      path.join(os.homedir(), "Library/Application Support/YOGO Studio/.local/runtime.json"),
      path.join(os.homedir(), "WorkSpace/yogo-studio/.local/runtime.json"),
      path.join(process.cwd(), ".local/runtime.json"),
    ].filter(Boolean) as string[];

    for (const file of candidates) {
      try {
        if (fs.existsSync(file)) {
          const content = fs.readFileSync(file, "utf8");
          const info = JSON.parse(content) as RuntimeInfo;
          if (info && /^http:\/\/127\.0\.0\.1:\d+$/.test(info.url)) {
            cachedRuntime = info;
            return info;
          }
        }
      } catch {
        // Ignore read errors
      }
    }
    cachedRuntime = null;
    cachedToken = null;
    return null;
  }

  // 2. Fetch or refresh player token
  async function getToken(url: string, forceFresh = false): Promise<string | null> {
    if (!forceFresh && cachedToken) return cachedToken;
    try {
      const signal = AbortSignal.timeout(1000);
      const res = await fetch(url, { signal });
      if (!res.ok) return null;
      const html = await res.text();
      const match = html.match(/const token=['"]([^'"]+)['"]/);
      if (match && match[1]) {
        cachedToken = match[1];
        return cachedToken;
      }
    } catch {
      // Offline or unreachable
    }
    return null;
  }

  // 3. Report state to YOGO Studio with 403 single retry
  async function report(sessionId: string, state: AgentState, turnId?: string, isRetry = false) {
    const runtime = getRuntimeInfo();
    if (!runtime) return;

    const token = await getToken(runtime.url, isRetry);
    if (!token) return;

    try {
      const signal = AbortSignal.timeout(1200);
      const body = {
        client: "pi",
        sessionId,
        state,
        turnId,
        ttlMs: SESSION_TTL_MS,
      };

      const res = await fetch(`${runtime.url}/agent-status`, {
        method: "POST",
        headers: {
          "X-Player-Token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!res.ok && res.status === 403 && !isRetry) {
        // Token might have expired due to daemon restart; invalidate and retry once immediately
        cachedToken = null;
        await report(sessionId, state, turnId, true);
      }
    } catch {
      // Server unreachable, fail silently
    }
  }

  function getSessionId(ctx?: { sessionManager?: { getSessionFile?(): string | undefined } }): string {
    const file = ctx?.sessionManager?.getSessionFile?.();
    if (file) {
      return path.basename(file);
    }
    return `pi-${process.pid}`;
  }

  // 4. Heartbeat keep-alive management for long-running turns
  function startHeartbeat(sessionId: string) {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (isAgentRunning && !hasActivePrompt) {
        report(sessionId, "busy");
      }
    }, HEARTBEAT_INTERVAL_MS);
    heartbeatTimer.unref?.();
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  // 5. Hook into Pi lifecycle events
  pi.on("agent_start", (_event, ctx) => {
    isAgentRunning = true;
    hasActivePrompt = false;
    const sid = getSessionId(ctx);
    report(sid, "busy");
    startHeartbeat(sid);
  });

  pi.on("turn_start", (event, ctx) => {
    isAgentRunning = true;
    const sid = getSessionId(ctx);
    if (!hasActivePrompt) {
      report(sid, "busy", String(event.turnIndex));
      startHeartbeat(sid);
    }
  });

  pi.on("ui_prompt_start", (_event, ctx) => {
    hasActivePrompt = true;
    stopHeartbeat();
    report(getSessionId(ctx), "waiting");
  });

  pi.on("ui_prompt_end", (_event, ctx) => {
    hasActivePrompt = false;
    const sid = getSessionId(ctx);
    if (isAgentRunning) {
      report(sid, "busy");
      startHeartbeat(sid);
    } else {
      stopHeartbeat();
      report(sid, "stopped");
    }
  });

  pi.on("turn_end", (event, ctx) => {
    hasActivePrompt = false;
    stopHeartbeat();
    report(getSessionId(ctx), "done", String(event.turnIndex));
  });

  pi.on("agent_end", (_event, ctx) => {
    isAgentRunning = false;
    hasActivePrompt = false;
    stopHeartbeat();
    report(getSessionId(ctx), "done");
  });

  pi.on("session_shutdown", (_event, ctx) => {
    isAgentRunning = false;
    hasActivePrompt = false;
    stopHeartbeat();
    report(getSessionId(ctx), "stopped");
  });
}
