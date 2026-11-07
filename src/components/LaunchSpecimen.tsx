import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { loadExample, type ExampleFile } from "../lib/explore";

export function LaunchSpecimen({ onOpen }: { onOpen: () => void }) {
  const { lang } = useI18n(); const es = lang === "es";
  const [example, setExample] = useState<ExampleFile | null>(null);
  useEffect(() => { let active = true; void loadExample().then(file => { if (active) setExample(file); }).catch(() => undefined); return () => { active = false; }; }, []);
  return <aside className="launch-specimen" aria-label={es ? "Ejemplo del catálogo, no un cliente" : "Catalog example, not a customer"}>
    <div className="specimen-head"><span>FIELD NOTES / 001</span><span>{es ? "CATÁLOGO" : "CATALOG"}</span></div>
    <p className="specimen-title">{es ? "Distinta web.\nMisma sensación." : "Different website.\nFamiliar feeling."}</p>
    {example ? <div className="specimen-pair"><figure><img src={`/data/${example.subject.thumb}`} alt={example.subject.title} width={420} height={263} /><figcaption>01 / {example.subject.title}</figcaption></figure><figure><img src={`/data/${example.twins[0].site.thumb}`} alt={example.twins[0].site.title} width={420} height={263} /><figcaption>02 / {example.twins[0].site.title}</figcaption></figure></div> : <p>{es ? "Un catálogo de portadas para comparar decisiones reales." : "A homepage catalog for comparing real design decisions."}</p>}
    <div className="specimen-footer"><p>{es ? "El parecido se explora. La calidad se revisa." : "Explore the resemblance. Review the quality."}</p><button className="text-link" onClick={onOpen}>{es ? "Abrir ejemplo real del catálogo" : "Open a real catalog example"} ↗</button></div>
  </aside>;
}
