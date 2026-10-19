import { useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { hostOf } from "../lib/match";
import { loadExplore, searchSites, type ExploreFile } from "../lib/explore";

export function SearchBox({ onPick }: { onPick: (slug: string) => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<ExploreFile | null>(null);
  const [failed, setFailed] = useState(false);

  const ready = () => {
    if (file || failed) return;
    void loadExplore()
      .then(setFile)
      .catch(() => setFailed(true));
  };

  const hits = useMemo(() => (file ? searchSites(file, query) : []), [file, query]);

  return (
    <div className="search">
      <label className="sr-only" htmlFor="catalog-search">
        {t.searchLabel}
      </label>
      <input
        id="catalog-search"
        type="search"
        placeholder={t.searchPlaceholder}
        value={query}
        autoComplete="off"
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          ready();
        }}
      />
      {open && query.trim().length >= 2 && (
        <ul className="search-list">
          {!file && !failed && <li className="search-empty">{t.loadingCatalog}</li>}
          {failed && <li className="search-empty">{t.errorCatalog}</li>}
          {file && hits.length === 0 && <li className="search-empty">{t.searchEmpty}</li>}
          {hits.map((site) => (
            <li key={site.slug}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setQuery("");
                  onPick(site.slug);
                }}
              >
                <strong>{site.title}</strong>
                <span>{hostOf(site.url)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
