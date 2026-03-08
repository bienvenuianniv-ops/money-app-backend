import type { Request, Response, NextFunction } from "express";

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error(err);

  if (res.headersSent) return;

  const status = Number.isInteger(err?.status) ? err.status : 500;
  const message = err?.message ?? "Erreur serveur";

  return res.status(status).json({ ok: false, message });
}
