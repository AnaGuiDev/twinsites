import assert from "node:assert/strict";
import { test } from "node:test";
import { fixPrompt, scoreSlop, TROPES } from "../src/lib/slop.ts";
import { parseRoute } from "../src/router.tsx";
import type { Traits } from "../src/types.ts";
const traits = { centered: true } as Traits;
test("similarity and a centered hero never become slop points", () => {
  for (const nearest of [0, 80, 100]) {
    const report = scoreSlop({ traits, nearest, review: {} });
    assert.equal(report.score, 0); assert.equal(report.coverage, 0); assert.equal(report.displayScore, null);
    assert.equal(report.signals.some(s => s.id === "likeness" || s.id === "centered"), false);
  }
});
test("unknown checks never silently pass; low coverage suppresses the overall number", () => {
  const report = scoreSlop({ traits, nearest: 100, cliches: 0, review: {} });
  assert.equal(report.coverage, 20); assert.equal(report.displayScore, null);
  assert.equal(report.signals.find(s => s.id === "trust")?.strength, null);
});
test("a full reviewed index remains bounded and versioned", () => {
  assert.equal(TROPES.reduce((n, t) => n + t.weight, 0), 100);
  const review = Object.fromEntries(TROPES.filter(t => t.weight > 0).map(t => [t.id, true]));
  const report = scoreSlop({ traits, nearest: 0, cliches: 0, review });
  assert.equal(report.score, 100); assert.equal(report.coverage, 100); assert.equal(report.displayScore, 100); assert.equal(report.version, "editorial-v2");
});
test("the display threshold is explicit and overrides retain evidence source", () => {
  const review = { "purple-gradient": false, "emoji-cards": false, bento: true, glass: false, "serif-italic": false };
  const report = scoreSlop({ traits, nearest: 100, cliches: 0, review });
  assert.equal(report.coverage, 85); assert.equal(report.displayScore, 15);
  assert.equal(report.signals.find(s => s.id === "bento")?.source, "review");
});
test("prompts do not invent customer evidence and routes tolerate malformed input", () => {
  assert.match(fixPrompt(TROPES.at(-1)!, "en"), /Do not invent/);
  assert.match(fixPrompt(TROPES.at(-1)!, "es"), /No inventes/);
  for (const name of ["services", "guide", "sample-audit", "order", "legal", "terms", "withdrawal", "studio"]) assert.deepEqual(parseRoute(`/${name}`), { name });
  assert.deepEqual(parseRoute("/site/%"), { name: "home" });
});
