import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { RouteLink } from "../router";
import { track } from "../lib/analytics";

interface DistinctSite {
  slug: string;
  title: string;
  url: string;
  thumb: string;
  twins: number;
}

let pending: Promise<Record<string, DistinctSite[]>> | null = null;

function loadDistinct(): Promise<Record<string, DistinctSite[]>> {
  if (!pending) {
    pending = fetch(`${import.meta.env.BASE_URL}data/distinct.json`)
      .then((response) => {
        if (!response.ok) throw new Error("distinct");
        return response.json() as Promise<{ categories: Record<string, DistinctSite[]> }>;
      })
      .then((file) => file.categories)
      .catch((error) => {
        pending = null;
        throw error;
      });
  }
  return pending;
}

/**
 * After "you look like everyone": pages in the same kind of product that look
 * like almost no one in the catalog. Different, not certified better.
 */
export function Inspiration({ initial }: { initial: string }) {
  const { t } = useI18n();
  const [categories, setCategories] = useState<Record<string, DistinctSite[]> | null>(null);
  const [category, setCategory] = useState(initial);

  useEffect(() => {
    let cancel = false;
    void loadDistinct()
      .then((next) => {
        if (cancel) return;
        setCategories(next);
        setCategory((current) => (next[current] ? current : Object.keys(next)[0]));
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  if (!categories) return null;
  const sites = (categories[category] ?? []).slice(0, 6);

  return (
    <section className="inspiration" aria-labelledby="inspiration-title">
      <div className="section-head">
        <h2 id="inspiration-title">{t.inspoTitle}</h2>
        <p>{t.inspoDek}</p>
      </div>
      <div className="chips" role="group" aria-label={t.inspoCategory}>
        {Object.keys(categories).map((key) => (
          <button
            key={key}
            type="button"
            className={key === category ? "chip is-on" : "chip"}
            aria-pressed={key === category}
            onClick={() => {
              track("inspiration");
              setCategory(key);
            }}
          >
            {t.categories[key] ?? key}
          </button>
        ))}
      </div>
      <div className="sheet inspo-sheet">
        {sites.map((site) => (
          <RouteLink key={site.slug} href={`/site/${site.slug}`}>
            <img src={`${import.meta.env.BASE_URL}data/${site.thumb}`} alt="" loading="lazy" />
            <span>{site.title}</span>
            <small>{t.inspoTwins(site.twins)}</small>
          </RouteLink>
        ))}
      </div>
    </section>
  );
}
