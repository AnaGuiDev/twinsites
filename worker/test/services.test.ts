import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { AuditService, businessDue, handleServices, offerFor, servicesReady, verifyStripe, type ServiceEnv } from "../src/services.ts";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const configured: ServiceEnv = { SERVICES_ENABLED: "1", SERVICE_CONTACT: "studio@example.com", STRIPE_SECRET_KEY: "sk_test_fixture", STRIPE_WEBHOOK_SECRET: "whsec_fixture", SERVICES_ADMIN_TOKEN: "a".repeat(40), RESEND_API_KEY: "re_fixture", SERVICE_FROM: "Studio <studio@example.com>" };
function fixture(extra: ServiceEnv = {}) {
  const records = new Map<string, unknown>(); let alarm = 0; let tail = Promise.resolve();
  const state = {
    storage: {
      get: async <T>(key: string) => structuredClone(records.get(key)) as T | undefined,
      put: async (key: string, value: unknown) => { records.set(key, structuredClone(value)); },
      delete: async (key: string) => records.delete(key),
      list: async <T>({ prefix, startAfter, limit = 1000 }: { prefix: string; startAfter?: string; limit?: number }) => new Map([...records.entries()].filter(([key]) => key.startsWith(prefix) && (!startAfter || key > startAfter)).sort(([a], [b]) => a.localeCompare(b)).slice(0, limit)) as Map<string, T>,
      setAlarm: async (time: number) => { alarm = time; },
    },
    blockConcurrencyWhile: <T>(fn: () => Promise<T>): Promise<T> => { const next = tail.then(fn); tail = next.then(() => undefined, () => undefined); return next; },
  };
  const storage = state.storage as typeof state.storage & { transaction: (fn: (s: typeof state.storage) => Promise<unknown>) => Promise<unknown> };
  storage.transaction = async fn => { const before = structuredClone(records); try { return await fn(storage); } catch (error) { records.clear(); for (const [k, v] of before) records.set(k, v); throw error; } };
  const env = { ...configured, ...extra };
  return { service: new AuditService({ ...state, storage: storage as never }, env), records, env, alarm: () => alarm };
}
function orderBody(extra = {}) { return { kind: "audit", email: "buyer@example.com", urls: ["https://example.com/"], pages: 1, notes: "Improve clarity", consent: true, terms: "twinsites-services-v1", quotedTotal: 30, lang: "es", requestId: crypto.randomUUID(), ...extra }; }
function request(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://worker.example/services/${path}`, { method: body === undefined ? "GET" : "POST", headers: { origin: "https://twinsites.com", "content-type": "application/json", "cf-connecting-ip": "203.0.113.9", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function signed(raw: string, timestamp = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(configured.STRIPE_WEBHOOK_SECRET!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${raw}`));
  return `t=${timestamp},v1=${[...new Uint8Array(signature)].map(x => x.toString(16).padStart(2, "0")).join("")}`;
}
async function webhook(service: AuditService, id: string, amount = 3000) {
  const event = { type: "checkout.session.completed", data: { object: { id: "cs_fixture", metadata: { order_id: id }, payment_status: "paid", amount_total: amount, currency: "usd", payment_intent: "pi_fixture" } } };
  const raw = JSON.stringify(event);
  return service.fetch(request("webhook", event, { "stripe-signature": await signed(raw) }));
}
function stripe() { globalThis.fetch = async (input, init) => { assert.equal(String(input), "https://api.stripe.com/v1/checkout/sessions"); const params = new URLSearchParams(String(init?.body)); assert.equal(params.get("line_items[0][price_data][unit_amount]"), "3000"); return Response.json({ id: "cs_fixture", url: "https://checkout.stripe.com/c/pay/fixture" }); }; }

test("services fail closed until the full setup exists; price arithmetic is server-owned", async () => {
  assert.equal(servicesReady({}), false); assert.equal(servicesReady(configured), true);
  assert.equal(servicesReady({ ...configured, SERVICES_ADMIN_TOKEN: "short" }), false);
  assert.equal(offerFor(0, { SERVICES_DYNAMIC_PRICE: "1" }).base, 20);
  assert.equal(offerFor(3, { SERVICES_DYNAMIC_PRICE: "1" }).base, 30);
  assert.equal(offerFor(8, { SERVICES_DYNAMIC_PRICE: "1" }).base, 40);
  const offer = await handleServices(request("offer"), configured); assert.equal((await offer.json()).enabled, false);
  assert.equal((await fixture({ SERVICES_ENABLED: "0" }).service.fetch(request("orders", orderBody()))).status, 503);
});
test("72 business hours skips the weekend, with exact fractional-hour handling", () => {
  assert.equal(new Date(businessDue(Date.parse("2026-11-06T15:30:00Z"))).toISOString(), "2026-11-11T15:30:00.000Z");
  assert.equal(new Date(businessDue(Date.parse("2026-11-07T10:00:00Z"))).toISOString(), "2026-11-12T00:00:00.000Z");
});
test("bad consent, private URLs, excessive pages and changed prices are refused before Stripe", async () => {
  const { service } = fixture(); globalThis.fetch = async () => { throw new Error("must not call provider"); };
  for (const bad of [{ consent: false }, { urls: ["https://127.0.0.1"] }, { pages: 11 }, { pages: 2 }, { notes: "x".repeat(2001) }]) assert.equal((await service.fetch(request("orders", orderBody(bad)))).status, 400);
  assert.equal((await service.fetch(request("orders", orderBody({ quotedTotal: 1 })))).status, 409);
  assert.equal((await service.fetch(request("orders", null))).status, 400);
});
test("checkout retries are idempotent, server-priced and do not confirm payment", async () => {
  const { service, records } = fixture(); stripe(); const body = orderBody();
  const first = await (await service.fetch(request("orders", body))).json();
  const again = await (await service.fetch(request("orders", body))).json();
  assert.equal(first.id, again.id); assert.equal(first.token, again.token);
  assert.equal([...records.keys()].filter(k => k.startsWith("order:")).length, 1);
  const status = await (await service.fetch(request(`orders/${first.id}`, undefined, { authorization: `Bearer ${first.token}` }))).json();
  assert.equal(status.status, "pending"); assert.equal(status.email, undefined); assert.equal(status.token, undefined);
  assert.equal((await service.fetch(request(`orders/${first.id}`))).status, 404);
});
test("provider timeout preserves a recoverable checkout with the same idempotency key", async () => {
  const { service, records } = fixture(); const body = orderBody(); let key = "";
  globalThis.fetch = async (_input, init) => { key = new Headers(init?.headers).get("Idempotency-Key")!; throw new Error("network"); };
  await assert.rejects(service.fetch(request("orders", body)));
  const id = [...records.keys()].find(k => k.startsWith("order:"))!.slice(6);
  globalThis.fetch = async (_input, init) => { assert.equal(new Headers(init?.headers).get("Idempotency-Key"), key); return Response.json({ id: "cs_fixture", url: "https://checkout.stripe.com/c/pay/fixture" }); };
  const retry = await (await service.fetch(request("orders", body))).json(); assert.equal(retry.id, id); assert.ok(retry.checkout);
});
test("signed webhook checks amount, session and replay before scheduling human work", async () => {
  const { service, records, alarm } = fixture(); stripe(); const order = await (await service.fetch(request("orders", orderBody()))).json();
  assert.equal((await webhook(service, order.id, 100)).status, 400);
  assert.equal((await service.fetch(request("webhook", {}, { "stripe-signature": "bad" }))).status, 400);
  assert.equal((await webhook(service, order.id)).status, 200);
  assert.equal((records.get(`order:${order.id}`) as { status: string }).status, "paid");
  assert.equal([...records.keys()].filter(k => k.startsWith("mail:")).length, 2);
  assert.equal((await webhook(service, order.id)).status, 200);
  assert.equal([...records.keys()].filter(k => k.startsWith("mail:")).length, 2); assert.ok(alarm());
});
test("webhook signatures reject old timestamps and altered bodies", async () => {
  const raw = '{"test":1}'; const header = await signed(raw);
  assert.equal(await verifyStripe(raw, header, configured.STRIPE_WEBHOOK_SECRET!), true);
  assert.equal(await verifyStripe(raw + " ", header, configured.STRIPE_WEBHOOK_SECRET!), false);
  assert.equal(await verifyStripe(raw, await signed(raw, 1), configured.STRIPE_WEBHOOK_SECRET!), false);
});
test("delivery is protected, retains the video on refund, and schedules recheck from delivery", async () => {
  const { service, records } = fixture(); stripe(); const order = await (await service.fetch(request("orders", orderBody()))).json(); await webhook(service, order.id);
  const delivery = { id: order.id, action: "deliver", videoUrl: "https://video.example.com/review", reportUrl: "https://report.example.com/report", usefulChanges: 5 };
  assert.equal((await service.fetch(request("admin", delivery))).status, 401);
  const admin = { authorization: `Bearer ${configured.SERVICES_ADMIN_TOKEN}` };
  assert.equal((await service.fetch(request("admin", { ...delivery, videoUrl: "javascript:alert(1)" }, admin))).status, 409);
  assert.equal((await service.fetch(request("admin", delivery, admin))).status, 200);
  const saved = records.get(`order:${order.id}`) as { deliveredAt: number; recheckAt: number; status: string; videoUrl: string };
  assert.equal(saved.recheckAt - saved.deliveredAt, 30 * 86400000);
  saved.recheckAt = Date.now() - 1; records.set(`order:${order.id}`, saved);
  const sent: string[] = []; globalThis.fetch = async (_input, init) => { sent.push(String(init?.body)); return Response.json({ id: "mail_fixture" }); };
  await service.alarm(); assert.ok(sent.some(s => s.includes("30-day recheck due")));
  globalThis.fetch = async input => { assert.equal(String(input), "https://api.stripe.com/v1/refunds"); return Response.json({ status: "succeeded" }); };
  assert.equal((await service.fetch(request("admin", { id: order.id, action: "refund" }, admin))).status, 200);
  const refunded = records.get(`order:${order.id}`) as { status: string; videoUrl: string }; assert.equal(refunded.status, "refunded"); assert.equal(refunded.videoUrl, delivery.videoUrl);
});
test("parallel order attempts cannot exceed the per-IP limit", async () => {
  const { service } = fixture(); stripe(); const results = await Promise.all(Array.from({ length: 8 }, () => service.fetch(request("orders", orderBody()))));
  assert.equal(results.filter(r => r.status === 201).length, 3); assert.equal(results.filter(r => r.status === 429).length, 5);
});
test("a redesign request queues a quote, never charges, and email failures remain in the outbox", async () => {
  const { service, records } = fixture(); globalThis.fetch = async () => { throw new Error("offline"); };
  const result = await (await service.fetch(request("orders", orderBody({ kind: "redesign", quotedTotal: 0 })))).json();
  assert.equal(result.checkout, undefined); assert.equal((records.get(`order:${result.id}`) as { status: string }).status, "quote");
  await service.alarm(); assert.equal([...records.keys()].filter(k => k.startsWith("mail:")).length, 2);
});

test("a redesign quote credits the paid audit once and blocks reuse and separate refund", async () => {
  const { service, records } = fixture(); stripe();
  const audit = await (await service.fetch(request("orders", orderBody()))).json(); await webhook(service, audit.id);
  const redesign = await (await service.fetch(request("orders", orderBody({ kind: "redesign", quotedTotal: 0 })))).json();
  const second = await (await service.fetch(request("orders", orderBody({ kind: "redesign", quotedTotal: 0 })))).json();
  globalThis.fetch = async (_input, init) => {
    assert.equal(new URLSearchParams(String(init?.body)).get("line_items[0][price_data][unit_amount]"), "197000");
    return Response.json({ id: "cs_redesign", url: "https://checkout.stripe.com/c/pay/redesign" });
  };
  const admin = { authorization: `Bearer ${configured.SERVICES_ADMIN_TOKEN}` };
  assert.equal((await service.fetch(request("admin", { id: redesign.id, action: "quote", gross: 2000, auditId: audit.id }, admin))).status, 200);
  assert.equal((records.get(`order:${redesign.id}`) as { total: number }).total, 1970);
  assert.equal((await service.fetch(request("admin", { id: second.id, action: "quote", gross: 2000, auditId: audit.id }, admin))).status, 409);
  assert.equal((await service.fetch(request("admin", { id: audit.id, action: "refund" }, admin))).status, 409);
  globalThis.fetch = async input => { assert.match(String(input), /cs_redesign\/expire$/); return Response.json({ status: "expired" }); };
  assert.equal((await service.fetch(request("admin", { id: redesign.id, action: "cancel-quote" }, admin))).status, 200);
  assert.equal((records.get(`order:${audit.id}`) as { creditedTo?: string }).creditedTo, undefined);
});
