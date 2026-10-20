/**
 * Cookieless, off until both build variables are set.
 * VITE_ANALYTICS_SRC is the script URL. VITE_ANALYTICS_DOMAIN is the Plausible
 * domain or the Umami website id. The same value is set on data-domain and
 * data-website-id, so either provider can read the attribute it knows.
 */

type AnalyticsWindow = Window & {
  plausible?: (event: string) => void;
  umami?: { track?: (event: string) => void };
};

const queue: string[] = [];
let started = false;

function configured(): { src: string; domain: string } | null {
  const src = import.meta.env.VITE_ANALYTICS_SRC;
  const domain = import.meta.env.VITE_ANALYTICS_DOMAIN;
  if (!src || !domain) return null;
  return { src, domain };
}

function fire(name: string): boolean {
  const win = window as AnalyticsWindow;
  if (typeof win.plausible === "function") {
    win.plausible(name);
    return true;
  }
  if (typeof win.umami?.track === "function") {
    win.umami.track(name);
    return true;
  }
  return false;
}

function flush(): void {
  const pending = queue.splice(0, queue.length);
  for (const name of pending) {
    if (!fire(name)) queue.push(name);
  }
}

export function track(
  name: "visit" | "example" | "upload" | "explore" | "result" | "share" | "subscribe" | "wall" | "wall-open" | "prompt" | "progress" | "inspiration" | "correction" | "rivals" | "copy",
): void {
  const config = configured();
  if (!config) return;
  if (!started) {
    started = true;
    const script = document.createElement("script");
    script.defer = true;
    script.src = config.src;
    script.setAttribute("data-domain", config.domain);
    script.setAttribute("data-website-id", config.domain);
    script.onload = flush;
    document.head.appendChild(script);
  }
  if (!fire(name)) queue.push(name);
}
