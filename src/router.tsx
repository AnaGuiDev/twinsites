import { createContext, useCallback, useContext, useEffect, useState, type MouseEvent, type ReactNode } from "react";

export type Route =
  | { name: "home" }
  | { name: "zones" }
  | { name: "zone"; slug: string }
  | { name: "site"; slug: string }
  | { name: "privacy" }
  | { name: "faq" };

export function parseRoute(pathname: string): Route {
  const path = decodeURIComponent(pathname).replace(/\/+$/, "") || "/";
  if (path === "/zones") return { name: "zones" };
  if (path === "/privacy") return { name: "privacy" };
  if (path === "/faq") return { name: "faq" };
  const zone = /^\/zone\/([^/]+)$/.exec(path);
  if (zone) return { name: "zone", slug: zone[1] };
  const site = /^\/site\/([^/]+)$/.exec(path);
  if (site) return { name: "site", slug: site[1] };
  return { name: "home" };
}

interface RouteApi {
  route: Route;
  go: (href: string) => void;
}

const RouteContext = createContext<RouteApi | null>(null);

export function RouteProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const go = useCallback((href: string) => {
    const next = href.startsWith("/") ? href : `/${href}`;
    if (window.location.pathname !== next) window.history.pushState(null, "", next);
    setRoute(parseRoute(next));
    window.scrollTo(0, 0);
  }, []);
  return <RouteContext.Provider value={{ route, go }}>{children}</RouteContext.Provider>;
}

export function useRoute(): RouteApi {
  const value = useContext(RouteContext);
  if (!value) throw new Error("route");
  return value;
}

export function RouteLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const { go } = useRoute();
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    go(href);
  };
  return (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  );
}
