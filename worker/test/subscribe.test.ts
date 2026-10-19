import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handle, type Env } from "../src/index.ts";
import { CONSENT_VERSION, hashEmail, normalizeEmail, signUnsub, subscriberKey, verifyUnsub } from "../src/subscribe.ts";

const EMAIL = "reader@example.com";

function memory(): Env["SHOTS"] & { dump: () => Map<string, string> } {
  const store = new Map<string, string>();
  return {
    dump: () => store,
    get: async (key) => store.get(key) ?? null,
    put: async (key, value) => {
      store.set(key, value);
    },
    delete: async (key) => {
      store.delete(key);
    },
  };
}

function env(shots: Env["SHOTS"]): Env {
  return { SHOTS: shots, UNSUB_SECRET: "test-unsub-secret", TURNSTILE_SECRET: "turnstile-test" };
}

function subscribe(body: unknown, ip = "203.0.113.20"): Request {
  return new Request("https://shot.example/subscribe", {
    method: "POST",
    headers: { origin: "https://twinsites.com", "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify(body),
  });
}

describe("normalizeEmail", () => {
  it("accepts a normal address and rejects junk", () => {
    assert.equal(normalizeEmail("  Reader@Example.com "), EMAIL);
    for (const bad of ["", "nope", "a@b", "a@b.", "space @example.com", "a@-bad.com", `${"a".repeat(250)}@example.com`]) {
      assert.equal(normalizeEmail(bad), null, bad);
    }
  });
});

describe("unsubscribe token", () => {
  it("round-trips the hash and rejects a tampered token", async () => {
    const hash = await hashEmail(EMAIL);
    const token = await signUnsub("test-unsub-secret", hash);
    assert.equal(await verifyUnsub("test-unsub-secret", token), hash);
    assert.equal(await verifyUnsub("other-secret", token), null);
    assert.equal(await verifyUnsub("test-unsub-secret", `${token}x`), null);
    assert.equal(token.includes(EMAIL), false);
  });
});

describe("POST /subscribe", () => {
  it("stores a hashed key and never logs the address", async () => {
    const shots = memory();
    const lines: string[] = [];
    const original = console.log;
    console.log = (line?: unknown) => {
      lines.push(String(line));
    };
    const previous = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.startsWith("https://challenges.cloudflare.com/turnstile/v0/siteverify")) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      throw new Error("unexpected");
    };
    try {
      const response = await handle(
        subscribe({ email: " Reader@Example.com ", consent: true, consentVersion: CONSENT_VERSION, token: "fresh" }),
        env(shots),
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("access-control-allow-origin"), "https://twinsites.com");
      const hash = await hashEmail(EMAIL);
      const stored = shots.dump().get(subscriberKey(hash));
      assert.ok(stored);
      const record = JSON.parse(stored) as { email: string; at: string; consent: string };
      assert.equal(record.email, EMAIL);
      assert.equal(record.consent, CONSENT_VERSION);
      assert.match(record.at, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal([...shots.dump().keys()].some((key) => key.includes(EMAIL)), false);
      assert.equal(lines.join("\n").includes(EMAIL), false);
      assert.equal(lines.some((line) => line.includes("subscribe-ok")), true);
    } finally {
      console.log = original;
      globalThis.fetch = previous;
    }
  });

  it("rejects a bad address, missing consent, and another origin before Turnstile", async () => {
    const shots = memory();
    let called = false;
    const previous = globalThis.fetch;
    globalThis.fetch = async () => {
      called = true;
      return new Response("no");
    };
    try {
      const bad = await handle(subscribe({ email: "not-an-email", consent: true, token: "x" }), env(shots));
      assert.equal(bad.status, 400);
      const consent = await handle(subscribe({ email: EMAIL, consent: false, token: "x" }), env(shots));
      assert.equal(consent.status, 400);
      const foreign = await handle(
        new Request("https://shot.example/subscribe", {
          method: "POST",
          headers: { origin: "https://evil.example", "content-type": "application/json" },
          body: JSON.stringify({ email: EMAIL, consent: true, consentVersion: CONSENT_VERSION, token: "x" }),
        }),
        env(shots),
      );
      assert.equal(foreign.status, 403);
      assert.equal(called, false);
    } finally {
      globalThis.fetch = previous;
    }
  });

  it("stops one address after 5 subscribe attempts in the hour", async () => {
    const shots = memory();
    const ip = "203.0.113.21";
    const now = Date.now();
    await shots.put(`subip:${ip}:${Math.floor(now / 3600000)}`, "5");
    const response = await handle(subscribe({ email: EMAIL, consent: true, consentVersion: CONSENT_VERSION, token: "x" }, ip), env(shots));
    assert.equal(response.status, 429);
  });
});

describe("GET /unsubscribe", () => {
  it("deletes the record and does not echo the address", async () => {
    const shots = memory();
    const hash = await hashEmail(EMAIL);
    await shots.put(subscriberKey(hash), JSON.stringify({ email: EMAIL, at: "2026-10-19T00:00:00.000Z", consent: CONSENT_VERSION }));
    const token = await signUnsub("test-unsub-secret", hash);
    const response = await handle(new Request(`https://shot.example/unsubscribe?token=${encodeURIComponent(token)}`), env(shots));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type")?.includes("text/html"), true);
    const html = await response.text();
    assert.match(html, /off the list/i);
    assert.equal(html.includes(EMAIL), false);
    assert.equal(shots.dump().has(subscriberKey(hash)), false);
  });

  it("leaves the record in place when the token is bad", async () => {
    const shots = memory();
    const hash = await hashEmail(EMAIL);
    await shots.put(subscriberKey(hash), JSON.stringify({ email: EMAIL, at: "2026-10-19T00:00:00.000Z", consent: CONSENT_VERSION }));
    const response = await handle(new Request("https://shot.example/unsubscribe?token=nope"), env(shots));
    assert.equal(response.status, 400);
    const html = await response.text();
    assert.match(html, /doesn't work|does not work/i);
    assert.equal(html.includes(EMAIL), false);
    assert.equal(shots.dump().has(subscriberKey(hash)), true);
  });
});
