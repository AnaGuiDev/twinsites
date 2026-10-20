import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";

/**
 * The page and its closest twin in one frame: a divider wipes one over the
 * other, so a shared layout lines up across the cut. On first view it sweeps
 * once (not with reduced motion); a range input drives it by pointer or keys.
 * "Side by side" shows the two whole.
 */
export function TwinCompare({
  you,
  twin,
  youLabel,
  twinLabel,
}: {
  you: string;
  twin: string;
  youLabel: string;
  twinLabel: string;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"slide" | "side">("slide");
  const [split, setSplit] = useState(50);
  const frame = useRef<HTMLDivElement>(null);
  const touched = useRef(false);

  useEffect(() => {
    touched.current = false;
    setSplit(50);
    const node = frame.current;
    if (!node || mode !== "slide") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const sweep = () => {
      const start = performance.now();
      // 50 → 92 → 8 → 50 over 2.4 s, eased; stops if the person takes over.
      const keys = [50, 92, 8, 50];
      const step = (now: number) => {
        if (touched.current) return;
        const p = Math.min(1, (now - start) / 2400);
        const seg = Math.min(keys.length - 2, Math.floor(p * (keys.length - 1)));
        const local = p * (keys.length - 1) - seg;
        const ease = local < 0.5 ? 2 * local * local : 1 - (-2 * local + 2) ** 2 / 2;
        setSplit(keys[seg] + (keys[seg + 1] - keys[seg]) * ease);
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    const seen = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          seen.disconnect();
          sweep();
        }
      },
      { threshold: 0.6 },
    );
    seen.observe(node);
    return () => {
      seen.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [you, twin, mode]);

  return (
    <div className="compare">
      <div className="compare-modes" role="group" aria-label={t.compareRange}>
        <button type="button" aria-pressed={mode === "slide"} onClick={() => setMode("slide")}>
          {t.compareSlide}
        </button>
        <button type="button" aria-pressed={mode === "side"} onClick={() => setMode("side")}>
          {t.compareSide}
        </button>
      </div>
      {mode === "slide" ? (
        <div className="compare-slide" ref={frame}>
          <img className="compare-under" src={twin} alt={twinLabel} />
          <div className="compare-over" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
            <img src={you} alt={youLabel} />
          </div>
          <div className="compare-line" style={{ left: `${split}%` }} aria-hidden="true">
            <span className="compare-knob" />
          </div>
          <span className="compare-tag is-left">{youLabel}</span>
          <span className="compare-tag is-right">{twinLabel}</span>
          <input
            className="compare-range"
            type="range"
            min={0}
            max={100}
            step={0.5}
            value={split}
            aria-label={t.compareRange}
            onPointerDown={() => {
              touched.current = true;
            }}
            onKeyDown={() => {
              touched.current = true;
            }}
            onChange={(event) => {
              touched.current = true;
              setSplit(Number(event.target.value));
            }}
          />
        </div>
      ) : (
        <div className="compare-side">
          <figure>
            <img src={you} alt={youLabel} />
            <figcaption>{youLabel}</figcaption>
          </figure>
          <figure>
            <img className="is-twin" src={twin} alt={twinLabel} />
            <figcaption>{twinLabel}</figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}
