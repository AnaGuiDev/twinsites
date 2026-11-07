import { useEffect, useState } from "react";
import { serviceEndpoint } from "../lib/services";
import { useI18n } from "../i18n";

type Order = { id: string; kind: string; status: string; email: string; urls: string[]; notes: string; dueAt?: number; cancelledAt?: number };
/** The operator credential lives in memory only. Never bundle it, put it in a URL or persist it. */
export function StudioConsole() {
  const { lang } = useI18n(); const es = lang === "es";
  const [token, setToken] = useState(""), [orders, setOrders] = useState<Order[]>([]);
  const [active, setActive] = useState<Order | null>(null), [message, setMessage] = useState("");
  const [report, setReport] = useState(""), [video, setVideo] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    document.title = "Studio — Twinsites";
    const meta = document.createElement("meta"); meta.name = "robots"; meta.content = "noindex,nofollow"; document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
  async function call(body?: Record<string, unknown>) {
    const endpoint = serviceEndpoint("/services/admin"); if (!endpoint) throw new Error(es ? "Servicio sin configurar" : "Service not configured");
    const response = await fetch(endpoint, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json(); if (!response.ok) throw new Error(`${response.status}: ${data.error}`); return data;
  }
  async function refresh() { setBusy(true); setMessage(""); try { const data = await call(); setOrders(data.orders); setMessage(`${data.orders.length} ${es ? "pedidos" : "orders"} · ${data.mail.length} ${es ? "emails en cola" : "emails queued"}`); } catch (e) { setMessage(String(e)); } finally { setBusy(false); } }
  async function deliver(action: string) {
    if (!active || busy) return;
    setBusy(true); setMessage("");
    try { await call({ id: active.id, action, videoUrl: video, reportUrl: report, recheckUrl: report, usefulChanges: 3 }); setActive(null); setReport(""); setVideo(""); setOrders((await call()).orders); setMessage(es ? "Acción registrada; el correo se enviará desde la cola." : "Action recorded; email will be sent by the outbox."); } catch (e) { setMessage(String(e)); } finally { setBusy(false); }
  }
  return <article className="studio-console"><p className="kicker">TWINSITES / OPERATOR</p><h1>{es ? "Mesa de trabajo." : "Work desk."}</h1><p>{es ? "Acceso exclusivo para quien entrega las auditorías. La clave no se guarda en el navegador." : "For the operator who delivers the audits. The credential is never saved in browser storage."}</p>
    <form className="operator-auth" onSubmit={e => { e.preventDefault(); void refresh(); }}><label>{es ? "Clave de operador" : "Operator credential"}<input type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" /></label><button className="ticket" disabled={busy || token.length < 32}>{es ? "Cargar agenda" : "Load schedule"}</button><button className="ticket ghost" type="button" onClick={() => { setToken(""); setOrders([]); setActive(null); setMessage(""); }}>{es ? "Cerrar sesión" : "Sign out"}</button></form>
    {message && <p role="status">{message}</p>}
    <div className="operator-orders">{orders.map(order => <article key={order.id}><p className="kicker">{order.status} / {order.kind}</p><h2>{order.urls[0]}</h2><p>{order.email}</p><p>{order.notes}</p>{order.cancelledAt && <p className="error">{es ? "Cancelación solicitada: revisar antes de trabajar." : "Cancellation requested: review before working."}</p>}{order.dueAt && <p>{new Date(order.dueAt).toLocaleString()}</p>}<button type="button" className="ticket ghost" onClick={() => { setActive(order); setReport(""); setVideo(""); }}>{es ? "Preparar entrega" : "Prepare delivery"}</button></article>)}</div>
    {active && <section className="operator-delivery"><h2>{es ? "Entregar trabajo real" : "Deliver real work"}</h2><p>{active.id}</p><label>{es ? "URL del vídeo" : "Video URL"}<input type="url" value={video} onChange={e => setVideo(e.target.value)} /></label><label>{es ? "URL del informe / revisión posterior" : "Report / follow-up URL"}<input type="url" value={report} onChange={e => setReport(e.target.value)} /></label><button className="ticket" disabled={busy || !report || !video || active.status !== "paid" || Boolean(active.cancelledAt)} onClick={() => void deliver("deliver")}>{es ? "Registrar auditoría y avisar al cliente" : "Record audit and notify customer"}</button><button className="ticket ghost" disabled={busy || !report || active.status !== "delivered"} onClick={() => void deliver("recheck")}>{es ? "Entregar revisión posterior" : "Deliver follow-up"}</button><p className="score-note">{es ? "Presupuestos, reembolsos y conciliación siguen disponibles mediante la herramienta de operador. No hay reembolsos con un clic accidental en esta pantalla." : "Quotes, refunds and reconciliation remain available in the operator CLI. This screen has no accidental one-click refund action."}</p></section>}
  </article>;
}
