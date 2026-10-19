import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dayKey, decideLimit, hourKey } from "../src/limit.ts";

describe("decideLimit", () => {
  it("allows a fresh visitor under the cap", () => {
    assert.deepEqual(decideLimit({ kill: false, ipCount: 0, globalCount: 0, dailyCap: 40 }), { ok: true, reason: "ok" });
  });

  it("stops one address after 5 shots in the hour", () => {
    assert.equal(decideLimit({ kill: false, ipCount: 4, globalCount: 4, dailyCap: 40 }).ok, true);
    assert.deepEqual(decideLimit({ kill: false, ipCount: 5, globalCount: 5, dailyCap: 40 }), { ok: false, reason: "ip" });
  });

  it("disables the feature at 80% of the global daily cap", () => {
    assert.equal(decideLimit({ kill: false, ipCount: 0, globalCount: 31, dailyCap: 40 }).ok, true);
    assert.deepEqual(decideLimit({ kill: false, ipCount: 0, globalCount: 32, dailyCap: 40 }), { ok: false, reason: "cap" });
  });

  it("honours the kill switch before either counter", () => {
    assert.deepEqual(decideLimit({ kill: true, ipCount: 0, globalCount: 0, dailyCap: 40 }), { ok: false, reason: "kill" });
  });
});

describe("keys", () => {
  it("buckets an address by the hour and the day", () => {
    const now = Date.UTC(2026, 9, 19, 17, 5, 0);
    assert.equal(hourKey("203.0.113.8", now), hourKey("203.0.113.8", now + 10 * 60 * 1000));
    assert.notEqual(hourKey("203.0.113.8", now), hourKey("203.0.113.8", now + 60 * 60 * 1000));
    assert.equal(dayKey(now), "day:2026-10-19");
  });
});
