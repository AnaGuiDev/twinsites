import assert from "node:assert/strict";
import { test } from "node:test";
import { fixPrompt, scoreSlop, TROPES } from "../src/lib/slop.ts";
import { parseRoute } from "../src/router.tsx";
import type { Traits } from "../src/types.ts";

const traits = { centered: false } as Traits;
test("a screenshot never silently passes structural or trust checks", () => {
  const report = scoreSlop({ traits, nearest: 80, review: {} });
  assert.equal(report.score, 0); assert.equal(report.coverage, 35); assert.equal(report.upper, 65);
  assert.equal(report.signals.find(s => s.id === "trust")?.strength, null);
  assert.equal(report.signals.find(s => s.id === "bento")?.source, "unknown");
});
test("a completed check has a bounded reproducible score and strongest-first fixes", () => {
  assert.equal(TROPES.reduce((n, t) => n + t.weight, 0), 100);
  const review = Object.fromEntries(TROPES.map(t => [t.id, true]));
  const report = scoreSlop({ traits, nearest: 100, cliches: 30, review });
  assert.equal(report.score, 100); assert.equal(report.coverage, 100); assert.equal(report.upper, 100);
  assert.equal(report.priorities[0].id, "likeness");
});
test("OCR contributes only after it completes, and a correction can dismiss a detection", () => {
  const input = { traits: { centered: true } as Traits, nearest: 90, review: {} };
  assert.equal(scoreSlop(input).score, 20);
  assert.equal(scoreSlop({ ...input, cliches: 2 }).score, 30);
  const corrected = scoreSlop({ ...input, cliches: 2, review: { centered: false, cliches: false } });
  assert.equal(corrected.score, 15); assert.equal(corrected.coverage, 50);
});
test("prompts include the actual fix and prohibit fabricated evidence in both languages", () => {
  assert.match(fixPrompt(TROPES.at(-1)!, "en"), /Do not invent/);
  assert.match(fixPrompt(TROPES.at(-1)!, "es"), /No inventes/);
});
test("studio routes and malformed encodings are safe", () => {
  for (const name of ["services", "guide", "sample-audit", "order"]) assert.deepEqual(parseRoute(`/${name}`), { name });
  assert.deepEqual(parseRoute("/site/%"), { name: "home" });
  assert.deepEqual(parseRoute("/site/%E0%A4%A"), { name: "home" });
});
