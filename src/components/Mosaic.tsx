import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useI18n } from "../i18n";
import { RouteLink, useRoute } from "../router";
import type { KinVerdict } from "../lib/calibrate";

interface MosaicSite {
  slug: string;
  title: string;
  z: number;
  /** [mode (0 twins, 1 neighborhood, 2 none), top %, count] */
  v: [number, number, number];
}

interface MosaicFile {
  tile: [number, number];
  cols: number;
  rows: number;
  zones: { slug: string; en: string; es: string }[];
  sites: MosaicSite[];
  near: number[][];
}

let pending: Promise<MosaicFile> | null = null;

export function loadMosaic(): Promise<MosaicFile> {
  if (!pending) {
    pending = fetch(`${import.meta.env.BASE_URL}data/mosaic.json`)
      .then((response) => {
        if (!response.ok) throw new Error("mosaic");
        return response.json() as Promise<MosaicFile>;
      })
      .catch((error) => {
        pending = null;
        throw error;
      });
  }
  return pending;
}

const MODES = ["twins", "neighborhood", "none"] as const;
const CYCLE_MS = 4200;
const MAX_LIT = 5;

function verdictOf(site: MosaicSite): KinVerdict {
  const [mode, top, count] = site.v;
  return { mode: MODES[mode] ?? "twins", band: 100 - top, top, count };
}

interface Active {
  index: number;
  twins: number[];
}

/**
 * The catalog as a wall, edge to edge: real homepages in grey. Every few
 * seconds one of them is picked and its actual look-alikes, wherever they sit
 * on the wall, light up. Pointing at any page does the same. The slot is the
 * hole in the wall where yours goes; it lines up with the page's left edge and
 * grows to fit what it holds.
 */
export function Mosaic({ slot }: { slot: ReactNode }) {
  const { lang, t } = useI18n();
  const { go } = useRoute();
  const [file, setFile] = useState<MosaicFile | null>(null);
  const [layout, setLayout] = useState({ col: 1, pad: 16, span: 7, full: false });
  const [visible, setVisible] = useState<Set<number>>(new Set());
  const [active, setActive] = useState<Active | null>(null);
  const [hovering, setHovering] = useState(false);
  const [paused, setPaused] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const wallRef = useRef<HTMLDivElement>(null);
  const [threads, setThreads] = useState<{ x1: number; y1: number; x2: number; y2: number }[]>([]);
  const innerRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<(HTMLElement | null)[]>([]);
  const reduced = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  useEffect(() => {
    let cancel = false;
    void loadMosaic()
      .then((next) => {
        if (!cancel) setFile(next);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  // Place the slot under the page's left edge, size it to its content, and
  // work out which tiles are actually on screen.
  const measure = useCallback(() => {
    const grid = gridRef.current;
    const inner = innerRef.current;
    const page = grid?.closest(".page");
    const first = tileRefs.current.find(Boolean);
    if (!grid || !inner || !page || !first) return;
    const tileRect = first.getBoundingClientRect();
    const step = tileRect.width + 2;
    const rowStep = tileRect.height + 2;
    const full = window.matchMedia("(max-width: 720px)").matches;
    const gridLeft = Math.min(...tileRefs.current.filter(Boolean).slice(0, 40).map((tile) => tile!.getBoundingClientRect().left));
    const pageLeft = page.getBoundingClientRect().left;
    const col = full ? 0 : Math.max(0, Math.floor((pageLeft - gridLeft) / step));
    const pad = full ? Math.max(16, Math.round(pageLeft - gridLeft)) : Math.max(16, Math.round(pageLeft - (gridLeft + col * step)));
    const span = Math.max(full ? 4 : 7, Math.ceil((inner.offsetHeight + 2) / rowStep));
    setLayout((prev) =>
      prev.col === col + 1 && prev.pad === pad && prev.span === span && prev.full === full
        ? prev
        : { col: col + 1, pad, span, full },
    );
  }, []);

  const scan = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const box = grid.parentElement!.getBoundingClientRect();
    const seen = new Set<number>();
    tileRefs.current.forEach((tile, index) => {
      if (!tile) return;
      const rect = tile.getBoundingClientRect();
      if (rect.bottom <= box.bottom + 1 && rect.right <= window.innerWidth + 1 && rect.left >= -1) seen.add(index);
    });
    setVisible((prev) => (prev.size === seen.size && [...seen].every((i) => prev.has(i)) ? prev : seen));
  }, []);

  useLayoutEffect(() => {
    measure();
  });

  useEffect(() => {
    if (!file) return;
    const run = () => {
      measure();
      requestAnimationFrame(scan);
    };
    run();
    const observer = new ResizeObserver(run);
    if (gridRef.current) observer.observe(gridRef.current);
    if (innerRef.current) observer.observe(innerRef.current);
    return () => observer.disconnect();
  }, [file, measure, scan, layout.span, layout.col]);

  const twinsOf = useCallback(
    (index: number) => (file ? file.near[index].filter((j) => visible.has(j)).slice(0, MAX_LIT) : []),
    [file, visible],
  );

  // Pages worth demonstrating: on screen, with at least three look-alikes on screen.
  const candidates = useMemo(() => {
    if (!file) return [];
    const list = [...visible].filter((i) => twinsOf(i).length >= (layout.full ? 2 : 3));
    // Spread the order so consecutive demos sit in different parts of the wall.
    return list.sort((a, b) => ((a * 97) % 191) - ((b * 97) % 191));
  }, [file, visible, twinsOf, layout.full]);

  const turn = useRef(0);
  useEffect(() => {
    if (!candidates.length || hovering) return;
    const show = () => {
      const index = candidates[turn.current % candidates.length];
      turn.current += 1;
      setActive({ index, twins: twinsOf(index) });
    };
    if (!active || !candidates.includes(active.index)) show();
    if (reduced || paused) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) show();
    }, CYCLE_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, hovering, paused, reduced, twinsOf]);

  // Threads from the picked page to each of its look-alikes.
  useLayoutEffect(() => {
    const wall = wallRef.current;
    if (!wall || !active) {
      setThreads([]);
      return;
    }
    const box = wall.getBoundingClientRect();
    const centre = (index: number) => {
      const rect = tileRefs.current[index]?.getBoundingClientRect();
      return rect ? { x: rect.left - box.left + rect.width / 2, y: rect.top - box.top + rect.height / 2 } : null;
    };
    const from = centre(active.index);
    if (!from) return;
    setThreads(
      active.twins
        .map((twin) => centre(twin))
        .filter((to): to is { x: number; y: number } => to !== null)
        .map((to) => ({ x1: from.x, y1: from.y, x2: to.x, y2: to.y })),
    );
  }, [active, layout]);

  const atlas = `url(${import.meta.env.BASE_URL}data/mosaic.webp)`;
  const subject = file && active ? file.sites[active.index] : null;
  const twinSet = new Set(active?.twins ?? []);

  const tiles = file
    ? file.sites.map((site, index) => {
        const col = index % file.cols;
        const row = Math.floor(index / file.cols);
        const role = active?.index === index ? " is-subject" : twinSet.has(index) ? " is-twin" : "";
        const style: CSSProperties & Record<string, string | number> = {
          backgroundImage: atlas,
          backgroundSize: `${file.cols * 100}% ${file.rows * 100}%`,
          backgroundPosition: `${(col / (file.cols - 1)) * 100}% ${(row / (file.rows - 1)) * 100}%`,
        };
        if (twinSet.has(index)) style["--i"] = active!.twins.indexOf(index);
        return (
          <a
            key={site.slug}
            ref={(node) => {
              tileRefs.current[index] = node;
            }}
            className={`tile${role}`}
            href={`/site/${site.slug}`}
            title={site.title}
            tabIndex={-1}
            aria-hidden="true"
            onPointerEnter={(event) => {
              if (event.pointerType !== "mouse") return;
              setHovering(true);
              setActive({ index, twins: twinsOf(index) });
            }}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
              event.preventDefault();
              go(`/site/${site.slug}`);
            }}
            style={style}
          />
        );
      })
    : Array.from({ length: 120 }, (_, index) => (
        <span
          key={index}
          ref={(node) => {
            tileRefs.current[index] = node;
          }}
          className="tile"
          aria-hidden="true"
        />
      ));

  const slotStyle: CSSProperties & Record<string, string> = {
    gridColumn: layout.full ? "1 / -1" : `${layout.col} / span 6`,
    gridRow: `2 / span ${layout.span}`,
    "--slot-pad": `${layout.pad}px`,
  };
  const wallStyle: CSSProperties & Record<string, string> = {
    "--wall-rows": String(layout.span + (layout.full ? 5 : 2)),
  };

  return (
    <>
      <div className={`mosaic${active ? " has-active" : ""}`} style={wallStyle} ref={wallRef}>
        <div className="mosaic-grid" ref={gridRef} onPointerLeave={() => setHovering(false)}>
          <div className="mosaic-slot" style={slotStyle}>
            <div className="slot-inner" ref={innerRef}>
              {slot}
            </div>
          </div>
          {tiles}
        </div>
        <svg className="threads" aria-hidden="true" key={active ? `${active.index}` : "none"}>
          {threads.map((line, index) => {
            const length = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
            return (
              <g key={index} style={{ ["--len" as string]: `${length}`, ["--i" as string]: index }}>
                <line className="halo" {...line} />
                <line className="ink" {...line} />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="demo-line">
        <p>
          {subject ? (
            <>
              <i className="demo-key" aria-hidden="true" />
              <RouteLink className="demo-title" href={`/site/${subject.slug}`}>
                {subject.title}
              </RouteLink>{" "}
              {t.demoVerdict(verdictOf(subject), lang === "es" ? file!.zones[subject.z]?.es ?? "" : file!.zones[subject.z]?.en ?? "")}{" "}
              <span className="demo-hint">{layout.full ? t.demoHintTouch : t.demoHint}</span>
            </>
          ) : (
            t.mosaicCaption
          )}
        </p>
        {!reduced && (
          <button type="button" className="demo-pause" onClick={() => setPaused((value) => !value)}>
            {paused ? t.demoResume : t.demoPause}
          </button>
        )}
      </div>
    </>
  );
}
