import { RouteLink } from "../router";
import release from "../../quality/model-release.json";
import { useI18n } from "../i18n";
export function ModelNotice() {
  const { lang } = useI18n();
  if (release.releaseReady) return null;
  return <p className="model-notice">{lang === "es" ? "Comparación visual orientativa: estamos validando su calibración. Se muestra separada del diagnóstico y no determina su nota. No demuestra autoría de IA, calidad ni originalidad." : "Visual comparison is indicative while its calibration is being validated. It is separate from the diagnosis and does not determine its score. It does not prove AI authorship, quality or originality."} <RouteLink href="/method">{lang === "es" ? "Ver método y evidencia →" : "Method and evidence →"}</RouteLink></p>;
}
