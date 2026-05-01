import type { Request, Response, NextFunction } from "express";

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Debug-only override for /admin routes.
 *
 * Environment toggles:
 * - ADMIN_OVERRIDE_DEBUG_ENABLED=true
 * - ADMIN_OVERRIDE_DEBUG_EMAIL=carpenterjames88@gmail.com
 */
export function adminOverrideDebug(req: Request, res: Response, next: NextFunction): void {
  const enabled = (process.env.ADMIN_OVERRIDE_DEBUG_ENABLED || "false").trim().toLowerCase() === "true";
  if (!enabled) {
    next();
    return;
  }

  const isAdminSurveyRoute = req.path.startsWith("/admin") || req.path === "/inference-logs/recent";
  if (!isAdminSurveyRoute) {
    next();
    return;
  }

  const allowedEmail = normalizeEmail(process.env.ADMIN_OVERRIDE_DEBUG_EMAIL || "your-email@example.com");
  const userEmail = normalizeEmail(req.authUser?.email);

  console.info(
    JSON.stringify({
      type: "admin_override_debug",
      route: req.originalUrl,
      method: req.method,
      auth_user_present: Boolean(req.authUser),
      auth_user_id: req.authUser?.userId ?? null,
      auth_user_role: req.authUser?.role ?? null,
      auth_user_email_raw: req.authUser?.email ?? null,
      auth_user_email_normalized: userEmail,
      override_email: allowedEmail,
      override_match: userEmail === allowedEmail,
    }),
  );

  if (userEmail === allowedEmail) {
    next();
    return;
  }

  res.status(403).json({
    error: "Admin override denied: authenticated email does not match ADMIN_OVERRIDE_DEBUG_EMAIL.",
  });
}
