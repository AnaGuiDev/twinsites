import { useEffect, useState } from "react";
import { RouteLink } from "../router";
import { useI18n } from "../i18n";
import { loadExplore, type ExploreFile } from "../lib/explore";
import { zoneSentence, type ZoneRecord } from "../lib/zones";

export function ZonesView({ slug }: { slug?: string }) {
  const { lang, t } = useI18n();
  const [file, setFile] = useState<ExploreFile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancel = false;
    void loadExplore()
      .then((next) => {
        if (!cancel) setFile(next);
      })
      .catch(() => {
        if (!cancel) setFailed(true);
      });
    return () => {
      cancel = true;
    };
  }, []);

  if (failed) return <p className="error">{t.errorCatalog}</p>;
  if (!file) return <p className="score-note">{t.loadingCatalog}</p>;

  if (!slug) {
    const bySlug = new Map(file.sites.map((site) => [site.slug, site]));
    return (
      <section className="atlas">
        <h1>{t.atlasTitle}</h1>
        <p className="lede">{t.atlasLede}</p>
        <ul className="zone-grid">
          {file.zones.map((zone) => (
            <li key={zone.slug}>
              <RouteLink className="zone-card" href={`/zone/${zone.slug}`}>
                <span className="zone-thumbs" aria-hidden="true">
                  {zone.examples.slice(0, 4).map((slug) => {
                    const site = bySlug.get(slug);
                    return site ? <img key={slug} src={`${import.meta.env.BASE_URL}data/${site.thumb}`} alt="" loading="lazy" /> : null;
                  })}
                </span>
                <h2>{lang === "es" ? zone.labelEs : zone.labelEn}</h2>
                <p className="zone-size">{t.zoneCount(zone.size)}</p>
              </RouteLink>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const zone = file.zones.find((item) => item.slug === slug);
  if (!zone) return <p className="error">{t.missingSite}</p>;
  return <ZonePage zone={zone} file={file} />;
}

function ZonePage({ zone, file }: { zone: ZoneRecord; file: ExploreFile }) {
  const { lang, t } = useI18n();
  const name = lang === "es" ? zone.labelEs : zone.labelEn;
  const featured = new Set(zone.examples);
  const residents = [
    ...zone.examples
      .map((slug) => file.sites.find((site) => site.slug === slug))
      .filter((site): site is ExploreFile["sites"][number] => Boolean(site)),
    ...file.sites.filter((site) => site.cluster === zone.id && !featured.has(site.slug)),
  ].slice(0, 60);
  const chips = zoneChips(zone, t);

  useEffect(() => {
    const previous = document.title;
    document.title = `${name} — Twinsites`;
    return () => {
      document.title = previous;
    };
  }, [name]);

  return (
    <section className="atlas">
      <h1>{name}</h1>
      <p className="lede">{zoneSentence(zone, lang)}</p>
      <ul className="trait-row zone-traits">
        {chips.map((chip) => (
          <li key={chip}>{chip}</li>
        ))}
      </ul>
      <div className="sheet">
        {residents.map((site) => (
          <RouteLink key={site.slug} href={`/site/${site.slug}`}>
            <img src={`${import.meta.env.BASE_URL}data/${site.thumb}`} alt="" loading="lazy" />
            <span>{site.title}</span>
          </RouteLink>
        ))}
      </div>
      <p className="score-note">
        <RouteLink className="text-link" href="/zones">
          {t.browseZones}
        </RouteLink>
      </p>
    </section>
  );
}

function zoneChips(zone: ZoneRecord, t: ReturnType<typeof useI18n>["t"]): string[] {
  const chips = [t.colorName(zone.topColor), t.zoneCount(zone.size)];
  if (zone.dark >= 0.62) chips.unshift(t.modeDark);
  else if (zone.dark <= 0.38) chips.unshift(t.modeLight);
  if (zone.centered >= 0.58) chips.push(t.centeredYes);
  // Only traits that held up against hand labels (see /faq); no density, gradient or box grid.
  return chips;
}
