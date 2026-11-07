export interface CommerceConfig {
  SELLER_PUBLICATION_APPROVED?: string;
  SELLER_LEGAL_NAME?: string;
  SELLER_TAX_ID?: string;
  SELLER_ADDRESS?: string;
  SELLER_COUNTRY?: string;
  SERVICE_CONTACT?: string;
  SERVICE_OPERATOR_CONFIRMED?: string;
  SERVICE_LEGAL_REVIEWED?: string;
  SERVICE_TAX_CONFIGURED?: string;
  SERVICE_WEEKLY_CAPACITY?: string;
  SERVICE_PRICE_EUR?: string;
  SERVICE_EXTRA_EUR?: string;
}
export function publicSeller(env: CommerceConfig) {
  if (env.SELLER_PUBLICATION_APPROVED !== "1") return null;
  const name = env.SELLER_LEGAL_NAME?.trim(), taxId = env.SELLER_TAX_ID?.trim();
  const address = env.SELLER_ADDRESS?.trim(), email = env.SERVICE_CONTACT?.trim();
  const country = env.SELLER_COUNTRY?.trim();
  if (!name || !taxId || !address || !email || !/^[A-Z]{2}$/.test(country || "")) return null;
  return { name, taxId, address, email, country: country! };
}
export function launchConfigured(env: CommerceConfig) {
  return Boolean(publicSeller(env)) && env.SERVICE_OPERATOR_CONFIRMED === "1" && env.SERVICE_LEGAL_REVIEWED === "1" && env.SERVICE_TAX_CONFIGURED === "1";
}
export function launchPricing(env: CommerceConfig) {
  const price = Number(env.SERVICE_PRICE_EUR || 89), extra = Number(env.SERVICE_EXTRA_EUR || 29);
  const capacity = Number(env.SERVICE_WEEKLY_CAPACITY || 2);
  return {
    base: Number.isInteger(price) && price >= 20 && price <= 1000 ? price : 89,
    extra: Number.isInteger(extra) && extra >= 0 && extra <= 500 ? extra : 29,
    capacity: Number.isInteger(capacity) && capacity >= 1 && capacity <= 20 ? capacity : 2,
  };
}
export function weekStart(now: number) {
  const date = new Date(now), day = (date.getUTCDay() + 6) % 7;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day);
}
