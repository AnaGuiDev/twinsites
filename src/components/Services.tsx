import { track } from "../lib/analytics";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { RouteLink } from "../router";
import { money, newRequestId, serviceEndpoint, SERVICE_TERMS } from "../lib/services";
import { useOffer } from "../lib/useOffer";
import { TROPES, fixPrompt } from "../lib/slop";

export function TropeCatalog() {
  const { lang } = useI18n();
  return <section className="trope-catalog"><p className="kicker">FIELD GUIDE / 01</p><div className="section-head"><h2>{lang === "es" ? "¿Te suena esta receta?" : "Recognize the recipe?"}</h2><RouteLink href="/guide">{lang === "es" ? "Qué es el web slop →" : "What is web slop? →"}</RouteLink></div><div className="trope-grid">{TROPES.filter(t => t.id !== "likeness").map((trope, i) => <article key={trope.id}><span className="trope-index">0{i + 1} / {trope.category}</span><h3>{trope.title[lang]}</h3><p>{trope.why[lang]}</p></article>)}</div></section>;
}

function PublicFeedback() {
  const { lang } = useI18n(); const es = lang === "es";
  const [url, setUrl] = useState("");
  const handle = import.meta.env.VITE_FEEDBACK_X_HANDLE || "";
  if (!/^[a-zA-Z0-9_]{1,15}$/.test(handle)) return null;
  let valid = false;
  try { valid = new URL(url).protocol === "https:"; } catch { /* waiting for a public URL */ }
  const text = es ? `@${handle} ¿Me das feedback sobre esta web? ${url}` : `@${handle} Could you give me feedback on this site? ${url}`;
  return <aside className="public-feedback"><h3>{es ? "Pide feedback gratis en X" : "Ask for free feedback on X"}</h3><p>{es ? "Tu URL y la petición serán públicos si decides publicar. Las respuestas dependen de disponibilidad." : "Your URL and request will be public if you post. Replies depend on availability."}</p><label>{es ? "URL pública" : "Public URL"}<input type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/" /></label>{valid && <a className="text-link" href={`https://x.com/intent/post?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">{es ? "Preparar publicación en X" : "Prepare a post on X"} →</a>}</aside>;
}

export function ServiceLadder() {
  const { lang } = useI18n(); const es = lang === "es";
  const { offer } = useOffer();
  return <section className="studio-invitation">
    <div><p className="kicker">TWINSITES STUDIO / {es ? "REVISIÓN HUMANA" : "HUMAN REVIEW"}</p>
      <h2>{es ? "Una dirección clara.\nNo otra lista de problemas." : "A clear direction.\nNot another list of problems."}</h2>
      <p>{es ? "Una persona revisa tu web, ordena lo que importa y te entrega los prompts para cambiarlo. Puedes contratar sin ejecutar el análisis automático." : "A person reviews your site, prioritizes what matters and gives you the prompts to change it. You can book without running the automated analysis."}</p>
      <RouteLink className="ticket" href="/services">{es ? "Ver la auditoría" : "Explore the audit"} →</RouteLink>
      <RouteLink className="text-link" href="/sample-audit">{es ? "Abrir un informe de ejemplo" : "Open a sample report"}</RouteLink>
    </div>
    <aside><span className="studio-rate">{money(offer.base)}</span><p>{es ? "1 página pública · pago único" : "1 public page · one-time payment"}</p>
      <ul><li>{es ? "Vídeo comentado + informe" : "Recorded walkthrough + report"}</li><li>{es ? "Tres prioridades con prompts" : "Three priorities with prompts"}</li><li>{es ? "Nueva revisión a los 30 días" : "A follow-up after 30 days"}</li></ul>
      <p className="score-note">{offer.enabled ? (es ? `${offer.available} plazas disponibles en la agenda de esta semana.` : `${offer.available} slots available in this week's schedule.`) : (es ? "Consulta el alcance y la disponibilidad antes de reservar." : "Check scope and availability before booking.")}</p>
    </aside><PublicFeedback />
  </section>;
}

export function ServicesPage() {
  const { lang } = useI18n(); const es = lang === "es";
  const [requestId] = useState(newRequestId);
  const { offer, loading } = useOffer();
  const [kind, setKind] = useState("audit"), [pages, setPages] = useState(1);
  const [urls, setUrls] = useState(""), [email, setEmail] = useState(""), [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false), [startImmediately, setStartImmediately] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { document.title = es ? "Auditoría de tu web — Twinsites" : "Your website audit — Twinsites"; }, [es]);
  useEffect(() => { track("services-view"); }, []);
  const total = offer.base + (pages - 1) * offer.extra;
  const full = kind === "audit" && offer.available === 0;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy || !offer.enabled || full) return;
    setBusy(true); setError(""); track("checkout-start");
    try {
      const endpoint = serviceEndpoint("/services/orders"); if (!endpoint) throw new Error();
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId, kind, email, urls: urls.split(/\n/).map(s => s.trim()).filter(Boolean), pages, notes, consent, startImmediately, terms: SERVICE_TERMS, quotedTotal: kind === "audit" ? total : 0, lang }) });
      const data = await response.json();
      if (!response.ok) {
        if (data.error === "fully-booked") throw new Error(es ? "La última plaza acaba de reservarse. No se ha cobrado nada." : "The last slot was just booked. Nothing has been charged.");
        if (data.error === "price-changed") throw new Error(es ? "El precio ha cambiado. Recarga y revisa el nuevo importe antes de pagar." : "The price changed. Reload and review the new total before paying.");
        throw new Error(es ? "No se pudo continuar. Comprueba email, URL HTTPS públicas y una URL por página contratada. Puedes reintentar sin duplicar el pedido." : "Could not continue. Check email, public HTTPS URLs and one URL per purchased page. Retrying will not duplicate the order.");
      }
      // Save the private recovery link before leaving for payment, including cancelled checkouts.
      try { sessionStorage.setItem("twinsites.order", `/order#${data.id}/${data.token}`); } catch { /* optional convenience */ }
      if (data.checkout) {
        const url = new URL(data.checkout); if (url.hostname !== "checkout.stripe.com" || url.protocol !== "https:") throw new Error();
        window.location.assign(url.href);
      } else window.location.assign(`/order#${data.id}/${data.token}`);
    } catch (err) { track("checkout-error"); setError(err instanceof Error && err.message ? err.message : (es ? "Servicio no disponible. Inténtalo más tarde." : "Service unavailable. Try again later.")); }
    finally { setBusy(false); }
  };
  return <article className="services-page launch-service">
    <div className="service-opening"><div><p className="kicker">TWINSITES STUDIO / 01</p>
      <h1>{es ? "Tu web,\ncon criterio propio." : "Your website.\nWith its own point of view."}</h1>
      <p className="lede">{es ? "Sal de la plantilla con una revisión humana y un plan que puedas llevar a tu editor." : "Move beyond the template with a human review and a plan you can take straight to your editor."}</p>
      <a className="ticket" href="#request-service">{es ? "Reservar una auditoría" : "Book an audit"} →</a>
      <RouteLink className="text-link" href="/sample-audit">{es ? "Ver el informe de ejemplo" : "See the sample report"}</RouteLink>
    </div><aside className="scope-receipt"><p className="kicker">{es ? "TU ENCARGO" : "YOUR BRIEF"}</p><strong className="studio-rate">{money(offer.base)}</strong><p>{es ? "Una página. Un pago. Sin suscripción." : "One page. One payment. No subscription."}</p><dl><dt>{es ? "Entregables" : "Deliverables"}</dt><dd>{es ? "Vídeo + informe + prompts" : "Video + report + prompts"}</dd><dt>{es ? "Entrega" : "Delivery"}</dt><dd>{es ? "5 días laborables desde el inicio" : "5 weekdays from service start"}</dd><dt>{es ? "Seguimiento" : "Follow-up"}</dt><dd>{es ? "30 días tras la entrega" : "30 days after delivery"}</dd><dt>{es ? "Páginas extra" : "Extra pages"}</dt><dd>{money(offer.extra)} · {es ? "hasta 3 en total" : "up to 3 total"}</dd></dl><p className="score-note">{es ? "Importe total con los impuestos aplicables incluidos. El precio confirmado aparece antes de pagar." : "Total includes applicable taxes. The confirmed total is shown before payment."}</p></aside></div>
    <section className="deliverables"><h2>{es ? "Recibes decisiones,\nno una puntuación de pago." : "Pay for decisions,\nnot for a score."}</h2><ol>
      <li><span>01</span><div><h3>{es ? "Mirar con contexto" : "Review in context"}</h3><p>{es ? "Tu producto, público y objetivo. Revisamos jerarquía, claridad, composición y credibilidad en tus URL públicas." : "Your product, audience and goal. We review hierarchy, clarity, composition and credibility on your public URLs."}</p></div></li>
      <li><span>02</span><div><h3>{es ? "Priorizar y explicar" : "Prioritize and explain"}</h3><p>{es ? "Un vídeo comentado, un informe y tres cambios principales. Cada arreglo incluye un prompt para Cursor, Claude Code, Lovable o v0." : "A recorded walkthrough, a report and three main changes. Every fix includes a prompt for Cursor, Claude Code, Lovable or v0."}</p></div></li>
      <li><span>03</span><div><h3>{es ? "Volver a mirar" : "Review again"}</h3><p>{es ? "A los 30 días de la entrega revisamos qué ha cambiado. No prometemos conversiones ni bajar una cifra: explicamos las diferencias." : "Thirty days after delivery, we review what changed. We do not promise conversions or a lower number; we explain the differences."}</p></div></li>
    </ol></section>
    <section id="request-service" className="booking-layout"><div><p className="kicker">{es ? "RESERVA" : "BOOKING"}</p><h2>{es ? "Empecemos por\ntu página." : "Start with\nyour page."}</h2><p>{es ? "La revisión humana funciona sin el modelo automático. Solo necesitamos tus URL públicas y el objetivo de la web." : "The human review works independently of the automated model. We only need your public URLs and the website's goal."}</p><p>{offer.enabled ? (es ? `Agenda semanal: ${offer.available} de ${offer.weeklyCapacity} plazas disponibles.` : `Weekly schedule: ${offer.available} of ${offer.weeklyCapacity} slots available.`) : (es ? "La contratación no está abierta en este momento. El formulario no enviará solicitudes ni aceptará pagos." : "Booking is not open at the moment. The form will not send requests or accept payments.")}</p><p className="score-note">{es ? "No incluye Figma, programación ni acceso a páginas privadas. El rediseño se acuerda y presupuesta aparte." : "No Figma, coding or access to private pages. Redesign is separately agreed and quoted."}</p></div>
      <form className="service-form" onSubmit={event => void submit(event)}>
        <label>{es ? "Qué necesitas" : "What you need"}<select value={kind} onChange={e => setKind(e.target.value)}><option value="audit">{es ? "Auditoría humana" : "Human audit"}</option><option value="redesign">{es ? "Hablar de un rediseño" : "Discuss a redesign"}</option></select></label>
        <label>Email<input type="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>
        {kind === "audit" && <label>{es ? "Páginas a revisar" : "Pages to review"}<select value={pages} onChange={e => setPages(Number(e.target.value))}>{[1, 2, 3].map(n => <option key={n} value={n}>{n} · {money(offer.base + (n - 1) * offer.extra)}</option>)}</select></label>}
        <label>{es ? "URL públicas, una por línea" : "Public URLs, one per line"}<textarea required rows={3} maxLength={6500} value={urls} onChange={e => setUrls(e.target.value)} placeholder="https://example.com/" /></label>
        <label>{es ? "¿Para quién es la web y qué debe conseguir?" : "Who is this for, and what should the page achieve?"}<textarea rows={3} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} /></label>
        <label className="list-consent"><input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} /><span>{es ? "He leído y acepto el alcance y las " : "I have read and accept the scope and "}<RouteLink href="/terms">{es ? "condiciones del servicio" : "service terms"}</RouteLink>. <RouteLink href="/privacy">{es ? "Información sobre el tratamiento de mis datos" : "How my data is processed"}</RouteLink>. {es ? "No me suscribe a marketing." : "No marketing subscription."}</span></label>
        {kind === "audit" && <label className="list-consent"><input type="checkbox" checked={startImmediately} onChange={e => setStartImmediately(e.target.checked)} /><span>{es ? "Solicito expresamente comenzar antes de finalizar los 14 días de desistimiento. Entiendo que podría abonar la parte ya prestada si desisto, y que perderé este derecho solo tras la ejecución íntegra cuando se cumplan los requisitos legales." : "I expressly request a start within the 14-day withdrawal period. I understand I may owe a proportionate amount if I withdraw, and lose this right only after full performance when legal requirements are met."} <RouteLink href="/withdrawal">{es ? "Ver mis derechos" : "My rights"}</RouteLink>.</span></label>}
        <p className="score-note">{kind === "audit" && (startImmediately ? (es ? "Inicio tras confirmar el pago. Entrega en cinco días laborables desde ese inicio." : "Work starts after confirmed payment. Delivery within five weekdays from that start.") : (es ? "Sin inicio anticipado: comenzamos después de 14 días. Después se cuentan los cinco días laborables de entrega." : "Without an early start: work starts after 14 days, followed by the five-weekday delivery period."))}</p>
        <div className="checkout-total"><span>{es ? "Total · pago único" : "Total · one-time"}</span><strong>{kind === "audit" ? money(total) : (es ? "Sin cobro" : "No charge")}</strong></div>
        <button className="ticket" disabled={!offer.enabled || loading || busy || !consent || full} type="submit">{busy ? (es ? "Preparando…" : "Preparing…") : full ? (es ? "Agenda completa esta semana" : "Fully booked this week") : kind === "audit" ? (es ? `Continuar a pagar ${money(total)}` : `Continue to pay ${money(total)}`) : (es ? "Solicitar presupuesto sin coste" : "Request a free quote")}</button>
        <p className="score-note">{es ? "El pago se completa en Stripe. No recibimos los datos de tu tarjeta. No se cobra al solicitar presupuesto." : "Payment is completed on Stripe. We never receive card details. Quote requests are not charged."}</p>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </section>
    <section className="service-boundary"><h2>{es ? "¿Quieres que también lo implementemos?" : "Want us to implement it too?"}</h2><p>{es ? "El rediseño se define contigo: alcance, presupuesto y fechas por escrito. El pago de una auditoría no reembolsada puede descontarse una vez del proyecto aceptado. No hay un cargo automático por pedir información." : "Redesign starts with an agreed scope, price and timeline in writing. A non-refunded audit payment can be credited once against an accepted project. Asking for information never triggers a charge."}</p><a href="#request-service" className="text-link">{es ? "Contar mi proyecto" : "Tell us about your project"} →</a></section>
    <nav className="service-legal"><RouteLink href="/legal">{es ? "Prestador" : "Seller"}</RouteLink><RouteLink href="/terms">{es ? "Condiciones" : "Terms"}</RouteLink><RouteLink href="/withdrawal">{es ? "Cancelaciones" : "Cancellations"}</RouteLink><RouteLink href="/privacy">{es ? "Privacidad" : "Privacy"}</RouteLink></nav>
  </article>;
}

export function GuidePage({ sample = false }: { sample?: boolean }) {
  const { lang } = useI18n(); const es = lang === "es";
  useEffect(() => { document.title = `${sample ? "Sample audit" : "Web slop guide"} — Twinsites`; }, [sample]);
  return <article className="guide-page"><p className="kicker">{sample ? "SAMPLE / FICTIONAL BRIEF" : "FIELD GUIDE"}</p><h1>{sample ? (es ? "Una auditoría, por dentro." : "Inside an audit.") : (es ? "Qué es el web slop" : "What is web slop?")}</h1><p className="lede">{sample ? (es ? "Ejemplo ilustrativo para una landing ficticia. No es un cliente real ni una auditoría entregada. El vídeo lo graba una persona en cada pedido; este ejemplo muestra el informe y los prompts." : "Illustrative report for a fictional landing page. Not a real customer or delivered audit. A person records the video for each order; this sample shows the report and prompts.") : (es ? "Páginas intercambiables: el aspecto promete mucho y el contenido explica poco. La IA puede producirlas, pero no es la única causa." : "Interchangeable pages: the styling promises a lot while the content explains little. AI can produce them, but it is not the only cause.")}</p>{sample && <p>{es ? "Objetivo del ejemplo: ayudar a una pequeña empresa a mostrar un producto concreto y conseguir solicitudes de demo. Prioridad: claridad, evidencia y una identidad propia." : "Example goal: help a small business show a specific product and earn demo requests. Priorities: clarity, evidence and a distinct identity."}</p>}
    {!sample && <><h2>{es ? "Parecido, calidad y autoría son cosas distintas" : "Similarity, quality and authorship are different"}</h2><p>{es ? "Twinsites compara tu primera pantalla con un catálogo. El percentil expresa parecido visual. Slop Score suma señales editoriales y muestra qué falta revisar. Ninguno demuestra que una web la haya hecho una IA, que convierta mal o que sus testimonios sean falsos." : "Twinsites compares your first viewport with a catalog. The percentile describes visual similarity. Slop Score adds editorial signals and shows what still needs review. Neither proves AI authorship, poor conversion or fabricated testimonials."}</p><h2>{es ? "Usa el resultado como una lista de preguntas" : "Use the result as a list of questions"}</h2><p>{es ? "Confirma o descarta cada señal, revisa las frases leídas por OCR y empieza por el cambio con más contexto. Compara una nueva captura del mismo tamaño después de editar. El criterio humano importa más que bajar una cifra." : "Confirm or dismiss each signal, review OCR text, and start with the best-supported change. Compare a new screenshot at the same size after editing. Human judgment matters more than lowering a number."}</p></>}
    {TROPES.filter(t => sample ? ["emoji-cards", "cliches", "trust"].includes(t.id) : true).map((trope, i) => <section className="guide-entry" key={trope.id}><p className="kicker">{sample ? `${es ? "ARREGLO" : "FIX"} ${i + 1}` : trope.category}</p><h2>{trope.title[lang]}</h2><p>{trope.why[lang]}</p><p>{trope.fix[lang]}</p>{sample && <><p><strong>{es ? "Criterio de aceptación: " : "Acceptance check: "}</strong>{es ? "El cambio usa contenido verificable, conserva el recorrido principal y se revisa en móvil y teclado." : "The change uses verifiable content, preserves the primary flow, and is checked on mobile and keyboard."}</p><details><summary>Prompt</summary><textarea readOnly rows={5} aria-label={`Prompt ${i + 1}`} value={fixPrompt(trope, lang)} /></details></>}</section>)}
    <RouteLink className="ticket" href={sample ? "/services" : "/"}>{es ? (sample ? "Ver la auditoría" : "Revisar mi web") : (sample ? "Get an audit" : "Check my site")}</RouteLink></article>;
}

export function OrderPage() {
  const { lang } = useI18n(); const es = lang === "es";
  const [order, setOrder] = useState<Record<string, string | number> | null>(null);
  const [error, setError] = useState(false), [refresh, setRefresh] = useState(0), [notice, setNotice] = useState("");
  const [cancelling, setCancelling] = useState(false);
  useEffect(() => {
    document.title = es ? "Tu pedido — Twinsites" : "Your order — Twinsites";
    const meta = document.createElement("meta"); meta.name = "robots"; meta.content = "noindex,nofollow"; document.head.appendChild(meta);
    return () => meta.remove();
  }, [es]);
  useEffect(() => {
    let dead = false; setError(false);
    const [id, token] = window.location.hash.slice(1).split("/");
    const endpoint = serviceEndpoint(`/services/orders/${encodeURIComponent(id || "")}`);
    if (!endpoint || !token) { setError(true); return; }
    void fetch(endpoint, { headers: { authorization: `Bearer ${token}` } }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => { if (!dead) setOrder(data); }).catch(() => { if (!dead) setError(true); });
    return () => { dead = true; };
  }, [refresh]);
  async function cancel() {
    if (cancelling) return; setCancelling(true); setNotice("");
    try {
      const [id, token] = window.location.hash.slice(1).split("/"); const endpoint = serviceEndpoint(`/services/cancel/${encodeURIComponent(id)}`); if (!endpoint || !token) throw new Error();
      const response = await fetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ reason: "Customer cancellation request from private order page" }) });
      if (!response.ok) throw new Error();
      setNotice(es ? "Solicitud recibida. Te confirmaremos por email cómo se resuelve y el reembolso que corresponda." : "Request received. We will email the resolution and any applicable refund."); setRefresh(n => n + 1);
    } catch { setNotice(es ? "No se pudo registrar. Usa el email del prestador indicado en las condiciones." : "Could not record the request. Use the seller email in the service terms."); }
    finally { setCancelling(false); }
  }
  const labels: Record<string, string> = es ? { expired: "Reserva de pago caducada", pending: "Pago pendiente", paid: "Pago confirmado", delivered: "Trabajo entregado", rechecked: "Revisión posterior entregada", quote: "Presupuesto solicitado", refunded: "Reembolsado" } : { expired: "Checkout reservation expired", pending: "Awaiting payment", paid: "Payment confirmed", delivered: "Work delivered", rechecked: "Follow-up delivered", quote: "Quote requested", refunded: "Refunded" };
  return <article className="guide-page"><p className="kicker">TWINSITES / ORDER</p><h1>{es ? "Tu encargo,\nen un lugar." : "Your brief.\nOne place."}</h1>
    <p className="score-note">{es ? "Guarda este enlace privado. Quien tenga su clave podrá ver el estado y los entregables." : "Save this private link. Anyone with its access key can see status and deliverables."}</p>
    {error ? <p role="alert">{es ? "No se puede consultar el pedido. Abre el enlace completo del pago o inténtalo de nuevo." : "Could not read this order. Open the full checkout link or try again."}</p> : order ? <>
      <p className="offer-price">{labels[String(order.status)] || order.status}</p><p>{es ? "Referencia" : "Reference"}: {order.id}</p>
      {Number(order.total) > 0 && <p>{money(Number(order.total))} EUR</p>}
      {["startAt", "dueAt", "recheckAt"].map(key => order[key] ? <p key={key}>{key === "startAt" ? (es ? "Inicio" : "Start") : key === "dueAt" ? (es ? "Entrega prevista" : "Delivery due") : (es ? "Revisión posterior" : "Follow-up")}: {new Date(Number(order[key])).toLocaleString(lang === "es" ? "es-ES" : "en-GB", { timeZone: "Europe/Madrid" })} Europe/Madrid</p> : null)}
      {["videoUrl", "reportUrl", "recheckUrl", "invoiceUrl"].map(key => order[key] ? <p key={key}><a className="text-link" href={String(order[key])} target="_blank" rel="noreferrer">{key === "videoUrl" ? "Video" : key === "reportUrl" ? (es ? "Informe y prompts" : "Report & prompts") : key === "invoiceUrl" ? (es ? "Factura en Stripe" : "Invoice on Stripe") : (es ? "Revisión posterior" : "Follow-up") } ↗</a></p> : null)}
      {order.checkout && !order.cancelledAt && <p><a className="ticket" href={String(order.checkout)}>{es ? "Completar pago seguro" : "Complete secure payment"}</a></p>}
      {order.cancelledAt && <p className="service-notice">{es ? "Hay una solicitud de cancelación pendiente de resolución. No se ha confirmado un reembolso por el mero hecho de solicitarla." : "A cancellation request awaits resolution. Submitting it does not by itself confirm a refund."}</p>}
      {order.status === "pending" && <p>{es ? "El pedido se confirma al recibir la notificación de Stripe, no al volver del pago." : "The order is confirmed by Stripe's notification, not by returning from checkout."}</p>}
      {Number(order.credit) > 0 && <p>{es ? "Crédito de auditoría" : "Audit credit"}: {money(Number(order.credit))}</p>}
      {!["refunded", "expired"].includes(String(order.status)) && <details><summary>{es ? "Necesito cancelar o ejercer desistimiento" : "I need to cancel or withdraw"}</summary><p><RouteLink href="/withdrawal">{es ? "Mis derechos y procedimiento" : "Rights and process"}</RouteLink></p><button className="ticket ghost" disabled={cancelling || Boolean(order.cancelledAt)} onClick={() => void cancel()}>{es ? "Registrar solicitud de cancelación" : "Record cancellation request"}</button></details>}
    </> : <p>{es ? "Consultando…" : "Loading…"}</p>}
    <p role="status">{notice}</p><button className="ticket ghost" onClick={() => setRefresh(n => n + 1)}>{es ? "Actualizar estado" : "Refresh status"}</button>
  </article>;
}
