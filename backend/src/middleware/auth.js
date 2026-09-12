import { config } from "../config.js";
import { getSession } from "../data/auth.js";

export function sessionToken(req) {
  const cookies = String(req.get("cookie") || "").split(";");
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator < 0) continue;
    const name = cookie.slice(0, separator).trim();
    if (name !== config.auth.cookieName) continue;
    try { return decodeURIComponent(cookie.slice(separator + 1).trim()); } catch { return ""; }
  }
  return "";
}

export async function requireAuth(req, res, next) {
  try {
    const user = await getSession(sessionToken(req));
    if (!user) return res.status(401).json({ error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." });
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Chỉ quản trị viên được thực hiện thao tác này." });
  }
  next();
}
