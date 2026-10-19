import { useEffect, useRef, useState, type DragEvent } from "react";
import { useI18n } from "../i18n";

export function DropZone({
  onFile,
  compact = false,
}: {
  onFile: (file: File) => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [hot, setHot] = useState(false);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) onFile(file);
          break;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onFile]);

  const take = (file: File | undefined) => {
    if (file) onFile(file);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setHot(false);
    take(event.dataTransfer.files?.[0]);
  };

  return (
    <div
      className={`sleeve ${hot ? "hot" : ""} ${compact ? "compact" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setHot(true);
      }}
      onDragLeave={() => setHot(false)}
      onDrop={onDrop}
    >
      <span className="crop tl" />
      <span className="crop tr" />
      <span className="crop bl" />
      <span className="crop br" />
      <p className="sleeve-kicker">{compact ? t.another : t.dropTitle}</p>
      {!compact && <p className="sleeve-hint">{t.dropHint}</p>}
      <button type="button" className="ticket" onClick={() => inputRef.current?.click()}>
        {t.browse}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(event) => {
          take(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
}
