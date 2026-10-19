import { useEffect, useRef, useState } from "react";
import type { Cluster, Lang, Site } from "../types";
import { hostOf } from "../lib/match";
import { useI18n } from "../i18n";

interface Hover {
  site: Site;
  x: number;
  y: number;
}

interface Camera {
  x: number;
  y: number;
  z: number;
}

export function MapView({
  sites,
  clusters,
  user,
  lang,
}: {
  sites: Site[];
  clusters: Cluster[];
  user: { x: number; y: number };
  lang: Lang;
}) {
  const { t } = useI18n();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<Camera>({ x: 0.5, y: 0.5, z: 1.05 });
  const autoRef = useRef(true);
  const images = useRef(new Map<string, HTMLImageElement>());
  const [hover, setHover] = useState<Hover | null>(null);
  const sitesRef = useRef(sites);
  sitesRef.current = sites;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const started = performance.now();
    let frame = 0;
    autoRef.current = true;
    cameraRef.current = { x: 0.5, y: 0.5, z: 1.05 };

    const project = (x: number, y: number, w: number, h: number) => {
      const cam = cameraRef.current;
      return {
        x: (x - cam.x) * cam.z * w + w / 2,
        y: (y - cam.y) * cam.z * h + h / 2,
      };
    };

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    const draw = (now = performance.now()) => {
      const rect = wrap.getBoundingClientRect();
      const dpr = canvas.width / Math.max(1, rect.width);
      const w = rect.width;
      const h = rect.height;
      const elapsed = Math.min(1, (now - started) / 1400);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      if (autoRef.current) {
        const focus = reduced ? 1 : eased;
        cameraRef.current = {
          x: 0.5 + (user.x - 0.5) * focus * 0.82,
          y: 0.5 + (user.y - 0.5) * focus * 0.82,
          z: 1.05 + 0.62 * focus,
        };
      }
      const drop = reduced ? 1 : eased;
      const uy = user.y - (1 - drop) * 0.2;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#14110e";
      ctx.fillRect(0, 0, w, h);

      const cam = cameraRef.current;
      for (const cluster of clusters) {
        const p = project(cluster.x, cluster.y, w, h);
        const radius = Math.max(18, cluster.r * cam.z * Math.min(w, h));
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = hexAlpha(cluster.color, 0.16);
        ctx.fill();
      }

      const showThumbs = cam.z > 2.35;
      for (const site of sitesRef.current) {
        const p = project(site.x, site.y, w, h);
        if (p.x < -30 || p.y < -30 || p.x > w + 30 || p.y > h + 30) continue;
        if (showThumbs) {
          const image = thumbFor(site, images.current, draw);
          if (image) {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(p.x - 27, p.y - 18, 54, 34, 3);
            ctx.clip();
            ctx.drawImage(image, p.x - 27, p.y - 18, 54, 34);
            ctx.restore();
            ctx.strokeStyle = "rgba(243,236,223,0.45)";
            ctx.strokeRect(p.x - 27, p.y - 18, 54, 34);
            continue;
          }
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(2.2, 2.6 * Math.sqrt(cam.z)), 0, Math.PI * 2);
        ctx.fillStyle = site.traits.dominant || "#f3ecdf";
        ctx.globalAlpha = 0.92;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.font = '500 12px "IBM Plex Mono", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const cluster of clusters) {
        const p = project(cluster.x, cluster.y, w, h);
        if (p.x < 40 || p.y < 20 || p.x > w - 40 || p.y > h - 16) continue;
        const label = lang === "es" ? cluster.labelEs : cluster.labelEn;
        const anchorY = p.y - cluster.r * cam.z * Math.min(w, h) * 0.15;
        paintWrapped(ctx, label, p.x, anchorY);
      }

      const you = project(user.x, uy, w, h);
      const pulse = reduced ? 0 : (1 - drop) * 46;
      if (pulse > 0.5) {
        ctx.beginPath();
        ctx.arc(you.x, you.y, 14 + pulse, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(184,44,26,${0.55 * (1 - drop)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(you.x, you.y, 13, 0, Math.PI * 2);
      ctx.fillStyle = "#f3ecdf";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(you.x, you.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#b82c1a";
      ctx.fill();
      ctx.font = '600 11px "IBM Plex Mono", monospace';
      ctx.fillStyle = "#f3ecdf";
      ctx.textAlign = "left";
      ctx.fillText(t.you, you.x + 18, you.y - 10);

      if (elapsed < 1 && autoRef.current) frame = requestAnimationFrame(draw);
    };

    resize();
    frame = requestAnimationFrame(draw);
    const observer = new ResizeObserver(() => {
      resize();
      draw();
    });
    observer.observe(wrap);

    const hit = (event: PointerEvent): { site: Site; x: number; y: number } | null => {
      const rect = canvas.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      let best: Site | null = null;
      let bestD = 16;
      const cam = cameraRef.current;
      for (const site of sitesRef.current) {
        const x = (site.x - cam.x) * cam.z * rect.width + rect.width / 2;
        const y = (site.y - cam.y) * cam.z * rect.height + rect.height / 2;
        const d = Math.hypot(x - mx, y - my);
        if (d < bestD) {
          bestD = d;
          best = site;
        }
      }
      return best ? { site: best, x: mx, y: my } : null;
    };

    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      autoRef.current = false;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (dragging) {
        const rect = canvas.getBoundingClientRect();
        const cam = cameraRef.current;
        cam.x -= (event.clientX - lastX) / (cam.z * rect.width);
        cam.y -= (event.clientY - lastY) / (cam.z * rect.height);
        lastX = event.clientX;
        lastY = event.clientY;
        setHover(null);
        draw();
        return;
      }
      const found = hit(event);
      setHover(found);
      canvas.style.cursor = found ? "pointer" : "grab";
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!dragging) return;
      const moved = Math.hypot(event.clientX - lastX, event.clientY - lastY);
      dragging = false;
      if (moved < 4) {
        const found = hit(event);
        if (found) window.open(found.site.url, "_blank", "noopener,noreferrer");
      }
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      autoRef.current = false;
      const rect = canvas.getBoundingClientRect();
      const cam = cameraRef.current;
      const mx = (event.clientX - rect.left) / rect.width;
      const my = (event.clientY - rect.top) / rect.height;
      const worldX = (mx - 0.5) / cam.z + cam.x;
      const worldY = (my - 0.5) / cam.z + cam.y;
      const next = Math.max(0.8, Math.min(8, cam.z * Math.exp(-event.deltaY * 0.0012)));
      cam.x = worldX - (mx - 0.5) / next;
      cam.y = worldY - (my - 0.5) / next;
      cam.z = next;
      draw();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", () => setHover(null));
    canvas.addEventListener("wheel", onWheel, { passive: false });

    const fit = () => {
      autoRef.current = false;
      cameraRef.current = { x: 0.5, y: 0.5, z: 1.05 };
      draw();
    };
    wrap.dataset.fit = "1";
    const fitButton = wrap.querySelector("[data-fit]");
    fitButton?.addEventListener("click", fit);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      fitButton?.removeEventListener("click", fit);
    };
  }, [clusters, lang, t.you, user.x, user.y]);

  return (
    <div className="map-frame" ref={wrapRef}>
      <canvas ref={canvasRef} role="img" aria-label={t.mapTitle} />
      <button type="button" className="ticket ghost map-fit" data-fit>
        {t.fit}
      </button>
      {hover && (
        <div className="tip" style={{ left: hover.x, top: hover.y }}>
          <img src={`${import.meta.env.BASE_URL}data/${hover.site.thumb}`} alt="" />
          <div>
            <strong>{hover.site.title}</strong>
            <span>{hostOf(hover.site.url)}</span>
          </div>
        </div>
      )}
      <div className="sr-only">
        {clusters.map((cluster) => (
          <p key={cluster.id}>{lang === "es" ? cluster.labelEs : cluster.labelEn}</p>
        ))}
      </div>
    </div>
  );
}

function paintWrapped(ctx: CanvasRenderingContext2D, label: string, x: number, y: number): void {
  const max = 150;
  const words = label.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(next).width > max) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  const lineHeight = 14;
  const start = y - ((lines.length - 1) * lineHeight) / 2;
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(20,17,14,0.72)";
  ctx.fillStyle = "rgba(243,236,223,0.92)";
  for (let index = 0; index < lines.length; index++) {
    const yy = start + index * lineHeight;
    ctx.strokeText(lines[index], x, yy);
    ctx.fillText(lines[index], x, yy);
  }
}

function thumbFor(
  site: Site,
  cache: Map<string, HTMLImageElement>,
  redraw: () => void,
): HTMLImageElement | null {
  const cached = cache.get(site.id);
  if (cached) return cached.complete && cached.naturalWidth ? cached : null;
  const image = new Image();
  image.onload = () => redraw();
  image.src = `${import.meta.env.BASE_URL}data/${site.thumb}`;
  cache.set(site.id, image);
  return null;
}

function hexAlpha(hex: string, alpha: number): string {
  const raw = hex.replace("#", "");
  if (raw.length !== 6) return `rgba(243,236,223,${alpha})`;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
