export const SERVICE_TERMS = "twinsites-services-v2";
export interface Offer {
  enabled: boolean;
  base: number;
  extra: number;
  maxPages: number;
  currency: string;
  dynamic: boolean;
  deliveryHours: number;
  recheckDays: number;
  redesignMin: number;
  redesignMax: number;
  contact: string;
  available?: number;
  weeklyCapacity?: number;
  legalReady?: boolean;
  seller?: { name: string; taxId: string; address: string; email: string; country: string };
}
export function serviceEndpoint(path: string): string | null {
  const endpoint = import.meta.env.VITE_SERVICES_ENDPOINT || import.meta.env.VITE_SHOT_ENDPOINT;
  if (!endpoint) return null;
  try { const url = new URL(endpoint); url.pathname = path; url.search = ""; url.hash = ""; return url.toString(); } catch { return null; }
}
export const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);

/** Secure random UUID, also available on plain-HTTP local previews. */
export function newRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
