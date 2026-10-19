import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRoute } from "../router";

interface MosaicFile {
  tile: [number, number];
  cols: number;
  rows: number;
  sites: { slug: string; title: string }[];
}

let pending: Promise<MosaicFile> | null = null;

function loadMosaic(): Promise<MosaicFile> {
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

/**
 * The catalog as a wall, edge to edge: real homepages in grey, each turning
 * to colour under the pointer. The slot is the hole in the wall where yours
 * goes; it lines up with the page's left edge whatever the window width.
 */
export function Mosaic({ slot }: { slot: ReactNode }) {
  const { go } = useRoute();
  const [file, setFile] = useState<MosaicFile | null>(null);
  const [startCol, setStartCol] = useState(2);
  const [pad, setPad] = useState(16);
  const [visible, setVisible] = useState(12);
  const gridRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const grid = gridRef.current;
    const page = grid?.closest(".page");
    if (!grid || !page) return;
    const place = () => {
      const first = grid.querySelector<HTMLElement>(".tile");
      const step = first ? first.getBoundingClientRect().width + 2 : 122;
      const left = page.getBoundingClientRect().left - grid.getBoundingClientRect().left;
      const col = Math.max(0, Math.floor(left / step));
      setStartCol(col + 1);
      setPad(Math.max(16, Math.round(left - col * step)));
      setVisible(Math.floor(window.innerWidth / step));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(page);
    return () => observer.disconnect();
  }, [file]);

  // Neighbours along the curve look alike: light up a few to show what a twin is.
  const litStart = Math.max(1, visible - 5);
  const atlas = `url(${import.meta.env.BASE_URL}data/mosaic.webp)`;
  const tiles = file
    ? file.sites.map((site, index) => {
        const col = index % file.cols;
        const row = Math.floor(index / file.cols);
        const lit = index >= litStart && index < litStart + 4;
        const style: CSSProperties & Record<string, string | number> = {
          backgroundImage: atlas,
          backgroundSize: `${file.cols * 100}% ${file.rows * 100}%`,
          backgroundPosition: `${(col / (file.cols - 1)) * 100}% ${(row / (file.rows - 1)) * 100}%`,
        };
        if (lit) style["--i"] = index - litStart;
        return (
          <a
            key={site.slug}
            className={lit ? "tile lit" : "tile"}
            href={`/site/${site.slug}`}
            title={site.title}
            tabIndex={-1}
            aria-hidden="true"
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
              event.preventDefault();
              go(`/site/${site.slug}`);
            }}
            style={style}
          />
        );
      })
    : Array.from({ length: 160 }, (_, index) => <span key={index} className="tile" aria-hidden="true" />);

  return (
    <div className="mosaic">
      <div className="mosaic-grid" ref={gridRef}>
        <div className="mosaic-slot" style={{ gridColumnStart: startCol, ["--slot-pad" as string]: `${pad}px` }}>
          {slot}
        </div>
        {tiles}
      </div>
    </div>
  );
}
