import { useEffect, useRef, useState, type DragEvent } from "react";
import { useI18n } from "../i18n";

export function DropZone({
  onFile,
  onIntent,
  compact = false,
  progress = null,
  progressLabel,
  stageLabel,
}: {
  onFile: (file: File) => void;
  onIntent?: () => void;
  compact?: boolean;
  progress?: number | null;
  progressLabel?: string;
  stageLabel?: string | null;
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
          if (file) {
            onIntent?.();
            onFile(file);
          }
          break;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onFile, onIntent]);

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
      onDragEnter={() => onIntent?.()}
      onDragLeave={() => setHot(false)}
      onDrop={onDrop}
      onPointerEnter={() => onIntent?.()}
    >
      {!compact && (
        <span className="stamp-mark" aria-hidden="true">
          {t.noUpload}
        </span>
      )}
      <span className="crop tl" />
      <span className="crop tr" />
      <span className="crop bl" />
      <span className="crop br" />
      <p className="sleeve-kicker">{compact ? t.another : t.dropTitle}</p>
      {progress != null && progressLabel && (
        <div className="bar-row">
          <div
            className="bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label={progressLabel}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
          <span className="bar-figure">{progress}%</span>
        </div>
      )}
      {!compact && (
        <p className="sleeve-hint" aria-live="polite">
          {stageLabel ?? t.dropHint}
        </p>
      )}
      {compact && stageLabel && (
        <p className="sleeve-hint" aria-live="polite">
          {stageLabel}
        </p>
      )}
      <button
        type="button"
        className="ticket"
        onFocus={() => onIntent?.()}
        onClick={() => {
          onIntent?.();
          inputRef.current?.click();
        }}
      >
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
