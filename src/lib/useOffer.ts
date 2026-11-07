import { useEffect, useState } from "react";
import { serviceEndpoint, type Offer } from "./services";

export const previewOffer: Offer = {
  enabled: false, base: 89, extra: 29, maxPages: 3, currency: "eur", dynamic: false,
  deliveryHours: 120, recheckDays: 30, redesignMin: 0, redesignMax: 0, contact: "",
};
export function useOffer() {
  const [offer, setOffer] = useState<Offer>(previewOffer);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const endpoint = serviceEndpoint("/services/offer");
    if (!endpoint) { setLoading(false); return; }
    void fetch(endpoint, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const data = await response.json() as Offer;
      if (data.currency !== "eur" || !Number.isInteger(data.base) || !Number.isInteger(data.extra) || data.maxPages !== 3) throw new Error();
      setOffer(data);
    }).catch(() => undefined).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  return { offer, loading };
}
