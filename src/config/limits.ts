export const DAILY_OUT_LIMIT = BigInt(process.env.DAILY_OUT_LIMIT ?? "200000"); // XOF/jour

export function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    0, 0, 0, 0
  ));
}