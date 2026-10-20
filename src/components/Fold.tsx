import { useState, type ReactNode } from "react";

/**
 * A secondary part of the result, folded on every screen: a title, one line
 * of what it holds, and the content mounted only when opened (the map and the
 * competitors stay unloaded until wanted).
 */
export function Fold({ id, title, dek, hint, children }: { id: string; title: string; dek: string; hint: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details id={id} className="fold" onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <span className="fold-text">
          <span className="fold-title">{title}</span>
          <span className="fold-dek">{dek}</span>
        </span>
        <span className="fold-hint">{hint}</span>
      </summary>
      {open && <div className="fold-body">{children}</div>}
    </details>
  );
}

/** Opens a folded part if needed and scrolls to it. */
export function jumpTo(id: string): void {
  const target = document.getElementById(id);
  if (!target) return;
  if (target instanceof HTMLDetailsElement) target.open = true;
  requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
}
