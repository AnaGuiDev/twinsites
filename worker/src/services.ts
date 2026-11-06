import { launchConfigured, launchPricing, publicSeller, weekStart, type CommerceConfig } from "./commerce-config";
import { validatePublicUrl } from "./url";
import { normalizeEmail } from "./subscribe";

const ORIGIN = "https://twinsites.com";
const TERMS = "twinsites-services-v2";
const DAY = 86400000;
interface Storage {
  transaction<T>(callback: (txn: Storage) => Promise<T>): Promise<T>;
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T>(options: { prefix: string; limit?: number; startAfter?: string }): Promise<Map<string, T>>;
  setAlarm(time: number): Promise<void>;
}
export interface ServiceEnv extends CommerceConfig {
  AUDITS?: { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } };
  SERVICES_ENABLED?: string;
  SERVICES_DYNAMIC_PRICE?: string;
  SERVICE_CONTACT?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  SERVICES_ADMIN_TOKEN?: string;
  RESEND_API_KEY?: string;
  SERVICE_FROM?: string;
}
interface Order {
  id: string; token: string; kind: "audit" | "redesign"; email: string; urls: string[]; notes: string;
  total: number; pages: number; at: number; terms: string; lang: string;
  status: "expired" | "pending" | "paid" | "delivered" | "rechecked" | "quote" | "refunded";
  session?: string; checkout?: string; paymentIntent?: string; paidAt?: number; dueAt?: number;
  deliveredAt?: number; recheckAt?: number; recheckNotified?: boolean;
  videoUrl?: string; reportUrl?: string; recheckUrl?: string;
  startImmediately?: boolean; startAt?: number; cancelledAt?: number; cancellationReason?: string;
  invoiceUrl?: string; invoiceId?: string;
  seller?: ReturnType<typeof publicSeller>;
  usefulChanges?: number;
  revision?: number; gross?: number; credit?: number; auditCreditId?: string; creditedTo?: string;
}
interface Mail { at: number; to: string; subject: string; text: string; attempts: number; nextAt: number }

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": ORIGIN, "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "Content-Type,Authorization", "cross-origin-resource-policy": "cross-origin", "x-content-type-options": "nosniff" } });
}

export function servicesReady(env: ServiceEnv) {
  return env.SERVICES_ENABLED === "1" && launchConfigured(env) && Boolean(normalizeEmail(env.SERVICE_CONTACT) && env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && (env.SERVICES_ADMIN_TOKEN?.length || 0) >= 32 && env.RESEND_API_KEY && env.SERVICE_FROM);
}
export function offerFor(active: number, env: ServiceEnv) {
  const pricing = launchPricing(env);
  return { enabled: servicesReady(env), base: pricing.base, extra: pricing.extra, maxPages: 3,
    currency: "eur", dynamic: false, deliveryHours: 120, recheckDays: 30,
    redesignMin: 0, redesignMax: 0, contact: normalizeEmail(env.SERVICE_CONTACT) || "",
    available: Math.max(0, pricing.capacity - active), weeklyCapacity: pricing.capacity,
    legalReady: Boolean(publicSeller(env)) && env.SERVICE_LEGAL_REVIEWED === "1", seller: publicSeller(env) };

}

/** 72 working hours means weekdays, 24 hours per weekday, UTC. No holiday calendar is implied. */
export function businessDue(start: number, hours = 72): number {
  let at = start, left = hours * 3600000;
  while (left > 0) {
    const date = new Date(at), day = date.getUTCDay();
    const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
    if (day === 0 || day === 6) { at = midnight; continue; }
    const take = Math.min(left, midnight - at); at += take; left -= take;
  }
  return at;
}

export async function verifyStripe(raw: string, signature: string, secret: string, now = Date.now()): Promise<boolean> {
  const parts = signature.split(",").map(s => s.split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1] || "";
  if (!/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300 || !secret) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  for (const [, value] of parts.filter(([key]) => key === "v1")) {
    if (!/^[a-f0-9]{64}$/i.test(value || "")) continue;
    const bytes = new Uint8Array(value.match(/../g)!.map(s => Number.parseInt(s, 16)));
    if (await crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(`${timestamp}.${raw}`))) return true;
  }
  return false;
}

async function readTextCapped(request: Request, cap: number): Promise<string | null> {
  const reader = request.body?.getReader(); if (!reader) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > cap) { await reader.cancel(); return null; } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}
async function bodyObject(request: Request): Promise<Record<string, unknown> | null> {
  const raw = await readTextCapped(request, 32000); if (raw === null) return null;
  try { const data: unknown = JSON.parse(raw); return data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null; } catch { return null; }
}

export async function handleServices(request: Request, env: ServiceEnv): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (!env.AUDITS) return path === "/services/offer" ? response(offerFor(0, { ...env, SERVICES_ENABLED: "0" })) : response({ error: "unavailable" }, 503);
  if (request.method === "OPTIONS") return request.headers.get("origin") === ORIGIN ? response(null, 200) : response({ error: "origin" }, 403);
  if (request.method === "POST" && !["/services/webhook", "/services/admin"].includes(path) && request.headers.get("origin") !== ORIGIN) return response({ error: "origin" }, 403);
  try { return await env.AUDITS.get(env.AUDITS.idFromName("studio-v1")).fetch(request); }
  catch { return response({ error: "unavailable" }, 503); }
}

/** Single coordinator serializes price snapshots, order transitions and rate counters. No KV read/modify/write races. */
export class AuditService {
  constructor(private state: { storage: Storage; blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T> }, private env: ServiceEnv) {}
  fetch(request: Request) { return this.state.blockConcurrencyWhile(() => this.handle(request)); }
  private async entries<T>(prefix: string): Promise<Map<string, T>> {
    const all = new Map<string, T>(); let cursor: string | undefined;
    while (true) { const page = await this.state.storage.list<T>({ prefix, limit: 1000, ...(cursor ? { startAfter: cursor } : {}) }); for (const [key, value] of page) all.set(key, value); if (page.size < 1000) return all; cursor = [...page.keys()].at(-1); }
  }
  private async handle(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/services/offer" && request.method === "GET") {
      const orders = await this.entries<Order>("order:"); return response(offerFor([...orders.values()].filter(o => o.kind === "audit" && o.at >= weekStart(Date.now()) && o.status !== "expired" && (o.status !== "refunded" || Boolean(o.deliveredAt))).length, this.env));
    }
    if (path === "/services/webhook" && request.method === "POST") return this.webhook(request);
    if (path === "/services/admin") return this.admin(request);
    if (path.startsWith("/services/orders/") && request.method === "GET") {
      const id = path.split("/").at(-1) || ""; const order = await this.state.storage.get<Order>(`order:${id}`);
      if (!order || request.headers.get("authorization") !== `Bearer ${order.token}`) return response({ error: "missing" }, 404);
      const { status, total, dueAt, recheckAt, videoUrl, reportUrl, recheckUrl, startAt, cancelledAt, invoiceUrl } = order;
      return response({ id, status, total, currency: "eur", startAt, cancelledAt, invoiceUrl, dueAt, recheckAt, videoUrl, reportUrl, recheckUrl, checkout: status === "pending" ? order.checkout : undefined, gross: order.gross, credit: order.credit });
    }
    if (path.startsWith("/services/cancel/") && request.method === "POST") {
      const id = path.split("/").at(-1) || "";
      const order = await this.state.storage.get<Order>(`order:${id}`);
      if (!order || request.headers.get("authorization") !== `Bearer ${order.token}`) return response({ error: "missing" }, 404);
      if (!order.cancelledAt) {
        const body = await bodyObject(request);
        order.cancelledAt = Date.now(); order.cancellationReason = typeof body?.reason === "string" ? body.reason.slice(0, 1000) : "";
        await this.state.storage.transaction(async txn => {
          await txn.put(`order:${id}`, order);
          await this.queueMail(`${id}-cancel`, this.env.SERVICE_CONTACT!, "Twinsites: cancellation request", `Order ${id}. Pause any unstarted work and review the statutory/contractual refund.\n${order.cancellationReason}`, txn);
          await this.queueMail(`${id}-cancel-received`, order.email, "Twinsites: cancellation request received", "We received your cancellation request. This is an acknowledgement, not a refund confirmation. We will reply about the applicable refund. Your statutory rights are unaffected.", txn);
          await txn.setAlarm(Date.now() + 60000);
        });
      }
      return response({ ok: true, cancelledAt: order.cancelledAt });
    }
    if (path !== "/services/orders" || request.method !== "POST") return response({ error: "missing" }, 404);
    if (!servicesReady(this.env)) return response({ error: "unavailable" }, 503);
    const body = await bodyObject(request);
    const email = normalizeEmail(body?.email);
    const urls = Array.isArray(body?.urls) ? body.urls : [];
    const pages = Number(body?.pages);
    if (!body || !email || !["audit", "redesign"].includes(String(body.kind)) || body.consent !== true || body.terms !== TERMS || typeof body.startImmediately !== "boolean" || !Number.isInteger(pages) || pages < 1 || pages > 3 || !urls.length || urls.length > 3 || (body.kind === "audit" && urls.length !== pages) || urls.some(url => typeof url !== "string" || !validatePublicUrl(url).ok) || new Set(urls).size !== urls.length || typeof body.notes !== "string" || body.notes.length > 2000 || !/^[a-f0-9-]{36}$/.test(String(body.requestId))) return response({ error: "invalid" }, 400);
    const prior = await this.state.storage.get<string>(`request:${body.requestId}`);
    if (prior) {
      const order = await this.state.storage.get<Order>(`order:${prior}`);
      if (order && order.email === email && order.kind === body.kind && order.pages === pages && JSON.stringify(order.urls) === JSON.stringify(urls) && order.notes === body.notes && order.startImmediately === body.startImmediately && (order.kind !== "audit" || order.total === body.quotedTotal)) {
        if (order.kind === "audit" && order.status === "pending" && !order.checkout) await this.checkout(order);
        return response({ id: order.id, token: order.token, checkout: order.checkout });
      }
      return response({ error: "invalid" }, 400);
    }
    const now = Date.now();
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${this.env.SERVICES_ADMIN_TOKEN}:${ip}:${Math.floor(now / 3600000)}`));
    const limitKey = `rate:${[...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("")}`;
    const rate = await this.state.storage.get<{ count: number; at: number }>(limitKey);
    if ((rate?.count || 0) >= 3) return response({ error: "limited" }, 429);
    const orders = await this.entries<Order>("order:");
    if ([...orders.values()].filter(o => o.at > now - DAY).length >= 100) return response({ error: "limited" }, 429);
    const offer = offerFor([...orders.values()].filter(o => o.kind === "audit" && o.at >= weekStart(Date.now()) && o.status !== "expired" && (o.status !== "refunded" || Boolean(o.deliveredAt))).length, this.env);
    if (body.kind === "audit" && offer.available === 0) return response({ error: "fully-booked" }, 409);
    const total = body.kind === "audit" ? offer.base + (pages - 1) * offer.extra : 0;
    if (body.quotedTotal !== total) return response({ error: "price-changed" }, 409);
    const id = crypto.randomUUID(), token = [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, "0")).join("");
    const order: Order = { id, token, email, urls: urls as string[], pages, total, notes: body.notes, startImmediately: body.startImmediately, seller: publicSeller(this.env), kind: body.kind as Order["kind"], at: now, terms: TERMS, lang: body.lang === "es" ? "es" : "en", status: body.kind === "audit" ? "pending" : "quote" };
    await this.state.storage.put(limitKey, { count: (rate?.count || 0) + 1, at: now });
    await this.state.storage.transaction(async txn => {
      await txn.put(`order:${id}`, order);
      await txn.put(`request:${body.requestId}`, id);
      await txn.setAlarm(now + 60000);
    });
    // Persist the order before making a provider request. A failure is retryable with the same requestId.
    if (order.kind === "audit") {
      await this.checkout(order);
    } else {
      await this.queueMail(`${id}-quote`, this.env.SERVICE_CONTACT!, "Twinsites: redesign request", `${id}\n${email}\n${order.urls.join("\n")}\n${order.notes}`);
      await this.queueMail(`${id}-received`, email, "Twinsites: request received", `Your redesign quote request was received. No payment was taken.\n${ORIGIN}/order#${id}/${token}`);
    }
    await this.state.storage.setAlarm(now + 60000);
    return response({ id, token, checkout: order.checkout }, 201);
  }
  private async checkout(order: Order) {
    const { id, token, email, pages, total } = order;
    const params = new URLSearchParams({ mode: "payment", "payment_method_types[0]": "card", customer_email: email, client_reference_id: id, "metadata[order_id]": id, "line_items[0][price_data][currency]": "eur", "line_items[0][price_data][unit_amount]": String(total * 100), "line_items[0][price_data][product_data][name]": order.kind === "audit" ? `Twinsites human audit · ${pages} page(s)` : "Twinsites custom redesign (agreed quote)", "line_items[0][quantity]": "1", "line_items[0][price_data][tax_behavior]": "inclusive",
      "automatic_tax[enabled]": "true", "billing_address_collection": "required", "customer_creation": "always", "tax_id_collection[enabled]": "true",
      "invoice_creation[enabled]": "true", "invoice_creation[invoice_data][metadata][order_id]": id,
      "consent_collection[terms_of_service]": "required", "payment_intent_data[metadata][order_id]": id,
      "metadata[terms_version]": order.terms, "metadata[start_immediately]": String(order.startImmediately === true),
      success_url: `${ORIGIN}/order#${id}/${token}`, cancel_url: `${ORIGIN}/order#${id}/${token}` });
    const result = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { authorization: `Bearer ${this.env.STRIPE_SECRET_KEY}`, "Idempotency-Key": `audit-${id}-${order.revision || 0}`, "content-type": "application/x-www-form-urlencoded" }, body: params, signal: AbortSignal.timeout(10000) });
    if (!result.ok) throw new Error("checkout");
    const session = await result.json() as { id: string; url: string };
    if (!session.id || typeof session.url !== "string" || new URL(session.url).hostname !== "checkout.stripe.com" || new URL(session.url).protocol !== "https:") throw new Error("checkout");
    order.session = session.id; order.checkout = session.url;
    await this.state.storage.put(`order:${id}`, order);
  }
  private async webhook(request: Request) {
    const raw = await readTextCapped(request, 1000000); if (raw === null || !(await verifyStripe(raw, request.headers.get("stripe-signature") || "", this.env.STRIPE_WEBHOOK_SECRET || ""))) return response({ error: "signature" }, 400);
    let event: { type: string; data: { object: { id: string; metadata?: { order_id?: string }; payment_status?: string; amount_total?: number; currency?: string; payment_intent?: string; invoice?: string; hosted_invoice_url?: string; amount_paid?: number; amount_refunded?: number; amount?: number; status?: string } } };
    try { event = JSON.parse(raw); } catch { return response({ error: "invalid" }, 400); }
    if (!event || typeof event !== "object") return response({ error: "invalid" }, 400);
    if (event.type === "checkout.session.expired") {
      const session = event.data?.object; const id = session?.metadata?.order_id || "";
      const order = await this.state.storage.get<Order>(`order:${id}`);
      if (order?.status === "pending" && order.session === session.id) {
        await this.state.storage.transaction(async txn => {
          order.status = "expired"; delete order.checkout;
          if (order.auditCreditId) {
            const audit = await txn.get<Order>(`order:${order.auditCreditId}`);
            if (audit?.creditedTo === order.id) { delete audit.creditedTo; await txn.put(`order:${audit.id}`, audit); }
          }
          await txn.put(`order:${id}`, order);
        });
      }
      return response({ ok: true });
    }
    if (event.type === "invoice.paid") {
      const invoice = event.data?.object; const id = invoice?.metadata?.order_id || "";
      const order = await this.state.storage.get<Order>(`order:${id}`);
      if (order && invoice.currency === "eur" && invoice.amount_paid === order.total * 100 && invoice.hosted_invoice_url?.startsWith("https://")) {
        order.invoiceId = invoice.id; order.invoiceUrl = invoice.hosted_invoice_url;
        await this.state.storage.put(`order:${id}`, order);
      }
      return response({ ok: true });
    }
    if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) return response({ ok: true });
    const session = event.data?.object; const id = session?.metadata?.order_id || "";
    const order = await this.state.storage.get<Order>(`order:${id}`);
    if (!order || order.session !== session.id || session.amount_total !== order.total * 100 || session.currency !== "eur") return response({ error: "mismatch" }, 400);
    if (session.payment_status !== "paid") return response({ ok: true });
    if (order.status !== "pending") return response({ ok: true });
    order.status = "paid"; order.paidAt = Date.now(); if (order.kind === "audit") order.dueAt = businessDue(order.startAt = order.startImmediately ? order.paidAt : order.paidAt + 14 * DAY, 120); order.paymentIntent = session.payment_intent; order.invoiceId = session.invoice || order.invoiceId;
    await this.state.storage.transaction(async txn => {
    await txn.put(`order:${id}`, order);
    await this.queueMail(`${id}-paid`, order.email, order.lang === "es" ? "Twinsites: pago confirmado" : "Twinsites: payment confirmed", this.confirmation(order), txn);
    await this.queueMail(`${id}-work`, this.env.SERVICE_CONTACT!, "Twinsites: paid work to deliver", `${id}\nDue: ${(order.dueAt ? new Date(order.dueAt).toISOString() : "custom scope")}\n${order.urls.join("\n")}\n${order.notes}`, txn);
    await txn.setAlarm(Date.now() + 60000);
    });
    return response({ ok: true });
  }
  private confirmation(order: Order) {
    const es = order.lang === "es";
    return [
      es ? `Pago confirmado: €${order.total} EUR.` : `Payment confirmed: €${order.total} EUR.`,
      order.dueAt ? `${es ? "Entrega prevista" : "Delivery due"}: ${new Date(order.dueAt).toISOString()} (5 ${es ? "días laborables desde el inicio" : "weekdays from start"}, UTC).` : (es ? "Entrega según el alcance del proyecto aceptado." : "Delivery follows the accepted project scope."),
      `${ORIGIN}/order#${order.id}/${order.token}`,
      `${es ? "Prestador" : "Seller"}: ${order.seller?.name || ""}; ${order.seller?.taxId || ""}; ${order.seller?.address || ""}; ${order.seller?.email || ""}`,
      `${es ? "Condiciones aceptadas" : "Terms accepted"}: ${order.terms}. ${es ? "Inicio anticipado solicitado" : "Early start requested"}: ${order.startImmediately === true}.`,
      order.kind === "audit" ? (es ? "Alcance: vídeo comentado, informe priorizado, tres cambios principales con prompts y revisión a los 30 días de entrega. Sin programación ni resultados comerciales garantizados." : "Scope: recorded walkthrough, prioritized report, three main changes with prompts and follow-up 30 days after delivery. No implementation or guaranteed business result.") : (es ? "Rediseño según presupuesto y alcance acordados por escrito." : "Redesign follows the quote and scope agreed in writing."),
      es ? "Como consumidor, generalmente dispones de 14 días naturales desde el contrato para desistir cuando se aplica la normativa española. El inicio anticipado no elimina por sí solo ese derecho: puede corresponder el pago proporcional por trabajo prestado si se cumplen los requisitos legales. El derecho solo puede perderse tras ejecución íntegra y con el consentimiento y conocimiento exigidos." : "Consumers generally have 14 calendar days from the contract to withdraw when Spanish law applies. Early start does not immediately waive withdrawal; proportionate work may be payable where legal requirements are met. The right may end upon full performance only with the required express consent and acknowledgement.",
      `${es ? "Condiciones" : "Terms"}: ${ORIGIN}/terms`,
      `${es ? "Cancelaciones y modelo de desistimiento" : "Cancellations and model form"}: ${ORIGIN}/withdrawal`,
      es ? "No te has suscrito a marketing." : "No marketing subscription.",
    ].join("\n\n");
  }
  private async admin(request: Request) {
    if (!this.env.SERVICES_ADMIN_TOKEN || request.headers.get("authorization") !== `Bearer ${this.env.SERVICES_ADMIN_TOKEN}`) return response({ error: "auth" }, 401);
    if (request.method === "GET") {
      const orders = await this.entries<Order>("order:"); const mail = await this.entries<Mail>("mail:");
      return response({ orders: [...orders.values()].map(({ token: _token, checkout: _checkout, ...order }) => order), mail: [...mail.entries()].map(([id, value]) => ({ id, attempts: value.attempts, nextAt: value.nextAt })) });
    }
    if (request.method !== "POST") return response({ error: "method" }, 405);
    const body = await bodyObject(request); if (!body || typeof body.id !== "string") return response({ error: "invalid" }, 400);
    if (body.action === "retry-mail" && body.id.startsWith("mail:")) {
      const mail = await this.state.storage.get<Mail>(body.id);
      if (!mail) return response({ error: "missing" }, 404);
      mail.attempts = 0; mail.nextAt = Date.now();
      await this.state.storage.put(body.id, mail); await this.state.storage.setAlarm(Date.now() + 60000);
      return response({ ok: true });
    }
    const order = await this.state.storage.get<Order>(`order:${body.id}`); if (!order) return response({ error: "missing" }, 404);
    const publicLink = (value: unknown): value is string => typeof value === "string" && validatePublicUrl(value).ok;
    if (body.action === "deliver" && !order.cancelledAt && (order.startAt || 0) <= Date.now() && order.kind === "audit" && order.status === "paid" && publicLink(body.videoUrl) && publicLink(body.reportUrl) && Number.isInteger(body.usefulChanges) && Number(body.usefulChanges) >= 0) {
      order.videoUrl = body.videoUrl; order.reportUrl = body.reportUrl; order.usefulChanges = Number(body.usefulChanges); order.deliveredAt = Date.now(); order.recheckAt = order.deliveredAt + 30 * DAY; order.status = "delivered";
      await this.transition(order, `${order.id}-delivery`, "Twinsites: your audit is ready", `Video: ${order.videoUrl}\nReport and prompts: ${order.reportUrl}\nRecheck due: ${new Date(order.recheckAt).toISOString()}\nReply if the delivered audit does not match the agreed scope. Statutory withdrawal and conformity rights remain unaffected.`);
    } else if (body.action === "complete-redesign" && order.kind === "redesign" && order.status === "paid" && publicLink(body.reportUrl)) {
      order.status = "delivered"; order.reportUrl = body.reportUrl; order.deliveredAt = Date.now();
      await this.transition(order, `${order.id}-delivery`, "Twinsites: redesign delivered", `Project handoff: ${order.reportUrl}`);
    } else if (body.action === "quote" && order.kind === "redesign" && order.status === "quote" && Number.isInteger(body.gross) && Number(body.gross) >= 1000 && Number(body.gross) <= 10000) {
      const auditId = typeof body.auditId === "string" ? body.auditId : "";
      const audit = auditId ? await this.state.storage.get<Order>(`order:${auditId}`) : undefined;
      if (auditId && (!audit || audit.kind !== "audit" || audit.email !== order.email || !["paid", "delivered", "rechecked"].includes(audit.status) || audit.creditedTo)) return response({ error: "credit" }, 409);
      order.gross = Number(body.gross); order.credit = audit?.total || 0; order.total = order.gross - order.credit; order.auditCreditId = audit?.id;
      order.status = "pending";
      await this.state.storage.transaction(async txn => {
        if (audit) { audit.creditedTo = order.id; await txn.put(`order:${audit.id}`, audit); }
        await txn.put(`order:${order.id}`, order);
        await txn.setAlarm(Date.now() + 60000);
      });
      await this.checkout(order);
      await this.queueMail(`${order.id}-proposal-${order.revision || 0}`, order.email, "Twinsites: redesign quote ready", `Agreed project quote: €${order.gross} EUR. Audit credit: €${order.credit}. Amount due: €${order.total}. Review your agreed scope before paying.\n${ORIGIN}/order#${order.id}/${order.token}`);
    } else if (body.action === "cancel-quote" && order.kind === "redesign" && order.status === "pending") {
      if (order.session) {
        const result = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(order.session)}/expire`, { method: "POST", headers: { authorization: `Bearer ${this.env.STRIPE_SECRET_KEY}` }, signal: AbortSignal.timeout(10000) });
        if (!result.ok) return response({ error: "cannot-expire" }, 409);
      }
      if (order.auditCreditId) {
        const audit = await this.state.storage.get<Order>(`order:${order.auditCreditId}`);
        if (audit && audit.creditedTo === order.id) { delete audit.creditedTo; await this.state.storage.put(`order:${audit.id}`, audit); }
      }
      order.status = "quote"; order.total = 0; order.revision = (order.revision || 0) + 1;
      delete order.checkout; delete order.session; delete order.auditCreditId; delete order.credit; delete order.gross;
      await this.state.storage.put(`order:${order.id}`, order);
    } else if (body.action === "retry-checkout" && order.status === "pending" && !order.checkout) {
      await this.checkout(order);
    } else if (body.action === "recheck" && order.status === "delivered" && publicLink(body.recheckUrl)) {
      order.recheckUrl = body.recheckUrl; order.status = "rechecked";
      await this.transition(order, `${order.id}-recheck`, "Twinsites: your 30-day check", `Your new measurement and notes: ${order.recheckUrl}`);
    } else if (body.action === "refund" && ["paid", "delivered", "rechecked"].includes(order.status) && order.paymentIntent && !order.creditedTo) {
      const result = await fetch("https://api.stripe.com/v1/refunds", { method: "POST", headers: { authorization: `Bearer ${this.env.STRIPE_SECRET_KEY}`, "Idempotency-Key": `refund-${order.id}`, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ payment_intent: order.paymentIntent }), signal: AbortSignal.timeout(10000) });
      if (!result.ok) return response({ error: "refund" }, 502);
      const refund = await result.json() as { status: string }; if (refund.status !== "succeeded") return response({ error: "refund-pending-review" }, 409);
      order.status = "refunded";
      await this.transition(order, `${order.id}-refund`, "Twinsites: refund processed", "Your audit payment was refunded. Your delivered video remains available.");
    } else return response({ error: "transition" }, 409);
    await this.state.storage.setAlarm(Date.now() + 60000); return response({ ok: true });
  }
  private async transition(order: Order, id: string, subject: string, text: string) {
    await this.state.storage.transaction(async txn => {
      await txn.put(`order:${order.id}`, order);
      await this.queueMail(id, order.email, subject, text, txn);
      await txn.setAlarm(Date.now() + 60000);
    });
  }
  private async queueMail(id: string, to: string, subject: string, text: string, storage = this.state.storage) {
    await storage.put(`mail:${id}`, { at: Date.now(), to, subject, text, attempts: 0, nextAt: Date.now() } satisfies Mail);
  }
  async alarm() {
    // Failures stay visible to the operator; provider calls use stable idempotency keys.
    const now = Date.now();
    const { orders, mails } = await this.state.blockConcurrencyWhile(async () => {
    const orders = await this.entries<Order>("order:");
    for (const [key, order] of orders) {
      if (order.at < now - 400 * DAY) { await this.state.storage.delete(key); continue; }
      if (order.kind === "audit" && order.status === "delivered" && order.recheckAt! <= now && !order.recheckNotified) {
        await this.queueMail(`${order.id}-due`, this.env.SERVICE_CONTACT!, "Twinsites: 30-day recheck due", `Recheck the public pages and deliver the new measurement for order ${order.id}.\n${order.urls.join("\n")}`);
        order.recheckNotified = true; await this.state.storage.put(key, order);
      }
    }
    const rates = await this.entries<{ at: number }>("rate:"); for (const [key, rate] of rates) if (rate.at < now - 2 * 3600000) await this.state.storage.delete(key);
    const requests = await this.entries<string>("request:"); for (const [key, id] of requests) if (!await this.state.storage.get(`order:${id}`)) await this.state.storage.delete(key);
    const mails = await this.entries<Mail>("mail:");
    for (const [key, mail] of mails) if (mail.at < now - 400 * DAY) { await this.state.storage.delete(key); mails.delete(key); }
    return { orders, mails };
    });
    for (const [key, mail] of [...mails.entries()].filter(([, m]) => m.nextAt <= Date.now() && m.attempts < 10).slice(0, 10)) {
      try {
        const result = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${this.env.RESEND_API_KEY}`, "content-type": "application/json", "Idempotency-Key": key }, body: JSON.stringify({ from: this.env.SERVICE_FROM, to: [mail.to], reply_to: this.env.SERVICE_CONTACT, subject: mail.subject, text: mail.text }), signal: AbortSignal.timeout(8000) });
        if (!result.ok) throw new Error("mail");
        await this.state.storage.delete(key);
      } catch { mail.attempts++; mail.nextAt = now + 3600000; await this.state.storage.put(key, mail); }
    }
    // Hourly wake-up also catches rechecks that become due. Delivery is always a human action.
    if (orders.size || mails.size) await this.state.storage.setAlarm(now + 3600000);
  }
}
