import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { RouteLink } from "../router";
import { loadMosaic } from "./Mosaic";

/** Every zone by name: the catalog's table of contents, set as type. */
export function ZoneIndex() {
  const { lang, t } = useI18n();
  const [zones, setZones] = useState<{ slug: string; en: string; es: string }[]>([]);

  useEffect(() => {
    let cancel = false;
    void loadMosaic()
      .then((file) => {
        if (!cancel) setZones(file.zones);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <div className="zone-index">
      <h2>{t.zonesTitle(zones.length || 16)}</h2>
      <ul>
        {zones.map((zone) => (
          <li key={zone.slug}>
            <RouteLink href={`/zone/${zone.slug}`}>{lang === "es" ? zone.es : zone.en}</RouteLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
