export const PER_IP_LIMIT = 5;
export const HOUR_MS = 60 * 60 * 1000;

export interface LimitInput {
  kill: boolean;
  ipCount: number;
  globalCount: number;
  dailyCap: number;
  perIpLimit?: number;
}

export interface LimitDecision {
  ok: boolean;
  reason: "ok" | "kill" | "ip" | "cap";
}

/** Stops the feature once the global counter reaches 80% of the daily cap. */
export function decideLimit(input: LimitInput): LimitDecision {
  const perIp = input.perIpLimit ?? PER_IP_LIMIT;
  if (input.kill) return { ok: false, reason: "kill" };
  if (!(input.dailyCap > 0)) return { ok: false, reason: "cap" };
  if (input.globalCount >= Math.floor(input.dailyCap * 0.8)) return { ok: false, reason: "cap" };
  if (input.ipCount >= perIp) return { ok: false, reason: "ip" };
  return { ok: true, reason: "ok" };
}

export function hourKey(ip: string, now: number): string {
  return `ip:${ip}:${Math.floor(now / HOUR_MS)}`;
}

export function dayKey(now: number): string {
  return `day:${new Date(now).toISOString().slice(0, 10)}`;
}
