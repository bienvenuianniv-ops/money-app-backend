export function computeTransferFee(amount: number): number {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("amount invalide");
  }

  // 1% arrondi à l'entier (on travaille en unités XOF)
  const raw = Math.floor(amount * 0.01);

  const minFee = 10;
  const maxFee = 500;

  return Math.min(maxFee, Math.max(minFee, raw));
}