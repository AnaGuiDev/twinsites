import { useState, type ReactNode } from "react";

/**
 * A secondary section of the result. On a phone it starts closed and its
 * content mounts only when opened (the map and the competitors stay unloaded
 * until wanted). On wider screens it is the plain section.
 */
export function Fold({ id, phone, title, hint, children }: { id: string; phone: boolean; title: string; hint: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!phone) return <div id={id}>{children}</div>;
  return (
    <details id={id} className="fold" onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <span className="fold-title">{title}</span>
        <span className="fold-hint">{hint}</span>
      </summary>
      {open && <div className="fold-body">{children}</div>}
    </details>
  );
}

/** Opens a folded section if needed and scrolls to it. */
export function jumpTo(id: string): void {
  const target = document.getElementById(id);
  if (!target) return;
  if (target instanceof HTMLDetailsElement) target.open = true;
  requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
}
