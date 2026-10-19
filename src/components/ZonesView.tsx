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
    return (
      <section className="atlas">
        <h1>{t.atlasTitle}</h1>
        <p className="lede">{t.atlasLede}</p>
        <ul className="zone-grid">
          {file.zones.map((zone) => (
            <li key={zone.slug}>
              <RouteLink className="zone-card" href={`/zone/${zone.slug}`}>
                <h2>{lang === "es" ? zone.labelEs : zone.labelEn}</h2>
                <p className="zone-size">{t.zoneCount(zone.size)}</p>
                <p>{zoneSentence(zone, lang)}</p>
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
  const examples = zone.examples
    .map((slug) => file.sites.find((site) => site.slug === slug))
    .filter((site): site is ExploreFile["sites"][number] => Boolean(site));
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
      <p className="kicker">{t.zone}</p>
      <h1>{name}</h1>
      <p className="lede">{zoneSentence(zone, lang)}</p>
      <ul className="trait-row">
        {chips.map((chip) => (
          <li key={chip}>{chip}</li>
        ))}
      </ul>
      <div className="twin-grid zone-examples">
        {examples.map((site) => (
          <article className="twin-card" key={site.slug}>
            <img src={`${import.meta.env.BASE_URL}data/${site.thumb}`} alt={site.title} />
            <div className="twin-meta">
              <h3>{site.title}</h3>
              <RouteLink href={`/site/${site.slug}`}>{t.itsTwins}</RouteLink>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function zoneChips(zone: ZoneRecord, t: ReturnType<typeof useI18n>["t"]): string[] {
  const chips = [t.colorName(zone.topColor), t.zoneCount(zone.size)];
  if (zone.dark >= 0.62) chips.unshift(t.modeDark);
  else if (zone.dark <= 0.38) chips.unshift(t.modeLight);
  if (zone.centered >= 0.58) chips.push(t.centeredYes);
  if (zone.gradient >= 0.45) chips.push(t.gradientYes);
  if (zone.bento >= 0.4) chips.push(t.bentoYes);
  if (zone.packed >= 0.48) chips.push(t.packed);
  else if (zone.airy >= 0.48) chips.push(t.airy);
  return chips;
}
