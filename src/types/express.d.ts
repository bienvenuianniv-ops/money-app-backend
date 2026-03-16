import "express";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        status: string;
        role: string;
      };
    }
  }
}

export {};