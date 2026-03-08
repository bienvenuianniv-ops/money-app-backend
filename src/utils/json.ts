export function jsonStringifyBigInt(obj: any): string {
  return JSON.stringify(obj, (_key, value) => {
    return typeof value === "bigint" ? value.toString() : value;
  });
}
