import { Router } from "express";
import {
  authenticate, createSession, createUser, deleteSession, listUsers,
} from "../data/auth.js";
import { bearerToken, requireAdmin, requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/login", async (req, res, next) => {
  try {
    const user = await authenticate(req.body?.username, req.body?.password);
    if (!user) return res.status(401).json({ error: "Tên đăng nhập hoặc mật khẩu không đúng." });
    res.json({ token: createSession(user), user });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));

router.post("/logout", requireAuth, (req, res) => {
  deleteSession(bearerToken(req));
  res.status(204).end();
});

router.get("/users", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    res.json({ users: await listUsers() });
  } catch (error) {
    next(error);
  }
});

router.post("/users", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const user = await createUser(req.body || {});
    res.status(201).json({ user });
  } catch (error) {
    next(error);
  }
});

export default router;
