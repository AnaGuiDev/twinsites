import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handle, type Env } from "../src/index.ts";
import { FEEDBACK_PER_IP, parseCorrection } from "../src/feedback.ts";

const GOOD = {
  trait: "centered",
  detected: "true",
  corrected: "false",
  measures: { luminance: 0.91234, saturation: 0.1, whitespace: 0.6, edge: 0.05, blockStd: 0.02, centerShare: 0.7 },
  version: "layout-2026-10",
};

function memory(): Env["SHOTS"] & { dump: () => Map<string, string> } {
  const store = new Map<string, string>();
  return {
    dump: () => store,
    get: async (key) => store.get(key) ?? null,
    put: async (key, value) => {
      store.set(key, value);
    },
  };
}

function env(shots: Env["SHOTS"], extra: Partial<Env> = {}): Env {
  return { SHOTS: shots, TURNSTILE_SECRET: "turnstile-test", FEEDBACK_SALT: "salt-test", ...extra };
}

function send(body: unknown, ip = "198.51.100.7", origin = "https://twinsites.com"): Request {
  return new Request("https://shot.example/feedback", {
    method: "POST",
    headers: { origin, "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify(body),
  });
}

async function withTurnstile<T>(ok: boolean, run: () => Promise<T>): Promise<T> {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: ok }), { status: 200 });
  try {
    return await run();
  } finally {
    globalThis.fetch = previous;
  }
}

describe("parseCorrection", () => {
  it("accepts a real correction and rounds the measures", () => {
    const parsed = parseCorrection(GOOD);
    assert.ok(parsed);
    assert.equal(parsed.measures.luminance, 0.912);
  });

  it("rejects unknown traits, same values, odd versions and out-of-range measures", () => {
    for (const bad of [
      { ...GOOD, trait: "url" },
      { ...GOOD, corrected: "true" },
      { ...GOOD, detected: "maybe" },
      { ...GOOD, version: "<script>" },
      { ...GOOD, measures: { ...GOOD.measures, edge: 4 } },
      { ...GOOD, measures: undefined },
      null,
    ]) {
      assert.equal(parseCorrection(bad), null, JSON.stringify(bad));
    }
  });
});

describe("/feedback", () => {
  it("stores only the correction, the measures and the day", async () => {
    const shots = memory();
    const response = await withTurnstile(true, () => handle(send({ ...GOOD, token: "t", url: "https://secret.example", email: "a@b.co" }), env(shots)));
    assert.equal(response.status, 200);
    const records = [...shots.dump().entries()].filter(([key]) => key.startsWith("fb:"));
    assert.equal(records.length, 1);
    const stored = JSON.parse(records[0][1]) as Record<string, unknown>;
    assert.deepEqual(Object.keys(stored).sort(), ["corrected", "day", "detected", "measures", "trait", "version"]);
    const raw = [...shots.dump().entries()].map(([key, value]) => `${key} ${value}`).join("\n");
    assert.ok(!raw.includes("198.51.100.7"), "IP must not be stored");
    assert.ok(!raw.includes("secret.example") && !raw.includes("a@b.co"), "extra fields must be dropped");
  });

  it("refuses other origins, bad bodies, a failed captcha and a missing salt", async () => {
    const shots = memory();
    assert.equal((await handle(send(GOOD, undefined, "https://evil.example"), env(shots))).status, 403);
    assert.equal((await handle(send({ trait: "x" }), env(shots))).status, 400);
    assert.equal((await withTurnstile(false, () => handle(send({ ...GOOD, token: "t" }), env(shots)))).status, 403);
    assert.equal((await handle(send(GOOD), env(shots, { FEEDBACK_SALT: "" }))).status, 503);
    assert.equal([...shots.dump().keys()].filter((key) => key.startsWith("fb:")).length, 0);
  });

  it("limits each IP per hour", async () => {
    const shots = memory();
    await withTurnstile(true, async () => {
      for (let i = 0; i < FEEDBACK_PER_IP; i++) {
        assert.equal((await handle(send({ ...GOOD, token: "t" }), env(shots))).status, 200);
      }
      assert.equal((await handle(send({ ...GOOD, token: "t" }), env(shots))).status, 429);
    });
  });
});
