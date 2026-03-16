import { Router, Request, Response, NextFunction } from "express";
import { AuthService, AuthError } from "../services/auth.service";

const router = Router();

router.post(
  "/register",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { phone, pin } = req.body;

      const result = await AuthService.register({
        phone,
        pin,
        ip: req.ip ?? null,
        userAgent: req.get("user-agent") ?? null,
        requestId: typeof req.headers["x-request-id"] === "string"
          ? req.headers["x-request-id"]
          : null,
        correlationId: typeof req.headers["x-correlation-id"] === "string"
          ? req.headers["x-correlation-id"]
          : null,
      });

      return res.status(201).json({
        success: true,
        message: "Compte cree avec succes.",
        data: result,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
      }

      return next(error);
    }
  }
);

router.post(
  "/login",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { phone, pin } = req.body;

      const result = await AuthService.loginWithPin({
        phone,
        pin,
        ip: req.ip ?? null,
        userAgent: req.get("user-agent") ?? null,
        requestId: typeof req.headers["x-request-id"] === "string"
          ? req.headers["x-request-id"]
          : null,
        correlationId: typeof req.headers["x-correlation-id"] === "string"
          ? req.headers["x-correlation-id"]
          : null,
      });

      return res.status(200).json({
        success: true,
        message: "Connexion reussie.",
        data: result,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
      }

      return next(error);
    }
  }
);

router.get(
  "/me",
  async (req: Request<{ userId: string }>, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;

      const user = await AuthService.getProfile(userId);

      return res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
      }

      return next(error);
    }
  }
);

router.patch(
  "/unlock-pin/:userId",
  async (req: Request<{ userId: string }>, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;

      const user = await AuthService.unlockPinManually({
        userId,
        ip: req.ip ?? null,
        userAgent: req.get("user-agent") ?? null,
        requestId: typeof req.headers["x-request-id"] === "string"
          ? req.headers["x-request-id"]
          : null,
        correlationId: typeof req.headers["x-correlation-id"] === "string"
          ? req.headers["x-correlation-id"]
          : null,
      });

      return res.status(200).json({
        success: true,
        message: "PIN deverrouille avec succes.",
        data: user,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
      }

      return next(error);
    }
  }
);

export default router;
