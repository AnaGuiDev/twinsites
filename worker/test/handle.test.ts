import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handle, type Env } from "../src/index.ts";
import { dayKey, hourKey } from "../src/limit.ts";

function memory(): Env["SHOTS"] {
  const store = new Map<string, string>();
  return {
    get: async (key) => store.get(key) ?? null,
    put: async (key, value) => {
      store.set(key, value);
    },
  };
}

function env(extra: Partial<Env> = {}): Env {
  return { SHOTS: memory(), SHOT_KILL: "0", SHOT_DAILY_CAP: "40", SHOT_PROVIDER: "browser", ...extra };
}

function post(url: string, ip = "203.0.113.9"): Request {
  return new Request("https://shot.example/", {
    method: "POST",
    headers: { origin: "https://twinsites.com", "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify({ url, token: "unused" }),
  });
}

describe("handle", () => {
  it("rejects malicious URLs before any screenshot", async () => {
    const shots = memory();
    const cases = [
      "http://example.com",
      "https://localhost",
      "https://127.0.0.1",
      "https://169.254.169.254",
      "https://[::1]/",
      "https://2130706433/",
      "https://example.com:8443/secret",
    ];
    for (const url of cases) {
      const response = await handle(post(url), env({ SHOTS: shots, BROWSER: { launch: () => Promise.reject(new Error("should not launch")) } }));
      assert.equal(response.status, 400, url);
      assert.equal(response.headers.get("access-control-allow-origin"), "https://twinsites.com");
      assert.equal(response.headers.get("cross-origin-resource-policy"), "cross-origin");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      const body = await response.json();
      assert.equal(JSON.stringify(body).includes(url), false);
    }
  });

  it("stays off when the kill switch is set", async () => {
    const response = await handle(post("https://example.com"), env({ SHOT_KILL: "1" }));
    assert.equal(response.status, 503);
  });

  it("enforces the per-IP hour limit", async () => {
    const shots = memory();
    const ip = "203.0.113.10";
    await shots.put(hourKey(ip, Date.now()), "5");
    const response = await handle(post("https://example.com", ip), env({ SHOTS: shots }));
    assert.equal(response.status, 429);
  });

  it("enforces the global cap", async () => {
    const shots = memory();
    await shots.put(dayKey(Date.now()), "32");
    const response = await handle(post("https://example.com"), env({ SHOTS: shots, SHOT_DAILY_CAP: "40" }));
    assert.equal(response.status, 429);
  });
});
