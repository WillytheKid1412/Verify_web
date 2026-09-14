import { Router } from "express";
import { config } from "../config.js";
import {
  authenticate, createSession, createUser, deleteSession, listUsers, recordLoginEvent,
} from "../data/auth.js";
import { sessionToken, requireAdmin, requireAuth } from "../middleware/auth.js";
import { recordAudit } from "../repositories/auditRepository.js";

const router = Router();
const cookieOptions = {
  httpOnly: true,
  secure: config.auth.cookieSecure,
  sameSite: "strict",
  path: "/api",
  maxAge: config.auth.sessionTtlMs,
};

router.post("/login", async (req, res, next) => {
  const username = req.body?.username;
  try {
    const user = await authenticate(username, req.body?.password);
    await recordLoginEvent({
      userId: user?.id,
      username,
      succeeded: Boolean(user),
      failureReason: user ? null : "invalid_credentials",
      ip: req.ip,
      userAgent: req.get("user-agent"),
      requestId: req.id,
    });
    if (!user) return res.status(401).json({ error: "Tên đăng nhập hoặc mật khẩu không đúng." });
    const session = await createSession(user, { ip: req.ip, userAgent: req.get("user-agent") });
    res.cookie(config.auth.cookieName, session.token, cookieOptions);
    res.json({ user, expires_at: session.expiresAt });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));

router.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await deleteSession(sessionToken(req));
    res.clearCookie(config.auth.cookieName, cookieOptions);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get("/users", requireAuth, requireAdmin, async (req, res, next) => {
  try { res.json({ users: await listUsers() }); } catch (error) { next(error); }
});

router.post("/users", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const user = await createUser({ ...req.body, createdBy: req.user.id });
    await recordAudit({
      actorId: req.user.id,
      action: "user.created",
      resourceType: "user",
      resourceId: user.id,
      metadata: { role: user.role },
      requestId: req.id,
      ip: req.ip,
    });
    res.status(201).json({ user });
  } catch (error) {
    next(error);
  }
});

export default router;
