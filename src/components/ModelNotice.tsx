import { RouteLink } from "../router";
import release from "../../quality/model-release.json";
import { useI18n } from "../i18n";
export function ModelNotice() {
  const { lang } = useI18n();
  if (release.releaseReady) return null;
  return <p className="model-notice">{lang === "es" ? "Comparación visual orientativa: estamos validando su calibración. Se muestra separada del diagnóstico y no determina su nota. Puedes contratar una revisión humana sin usarla." : "Visual comparison is indicative while its calibration is being validated. It is separate from the diagnosis and does not determine its score. You can book a human review without using it."} <RouteLink href="/method">{lang === "es" ? "Ver método y evidencia →" : "Method and evidence →"}</RouteLink></p>;
}
