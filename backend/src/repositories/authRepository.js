import crypto from "node:crypto";
import { promisify } from "node:util";
import { config } from "../config.js";
import { query } from "../db/pool.js";

const scrypt = promisify(crypto.scrypt);
const SCRYPT_PARAMS = Object.freeze({ N: 16_384, r: 8, p: 1, keyLength: 64 });

export function normalizeUsername(value) {
  return String(value || "").trim().toLocaleLowerCase("vi");
}

function validateAccount({ username, password, role }) {
  if (!/^[\p{L}\p{N}._-]{3,50}$/u.test(username)) {
    const error = new Error("Tên đăng nhập phải dài 3–50 ký tự và chỉ gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.");
    error.status = 400;
    throw error;
  }
  if (String(password || "").length < 12) {
    const error = new Error("Mật khẩu phải có ít nhất 12 ký tự.");
    error.status = 400;
    throw error;
  }
  if (!["admin", "reviewer"].includes(role)) {
    const error = new Error("Vai trò không hợp lệ.");
    error.status = 400;
    throw error;
  }
}

async function passwordHash(password, salt = crypto.randomBytes(16)) {
  const derived = await scrypt(String(password), salt, SCRYPT_PARAMS.keyLength, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    maxmem: 64 * 1024 * 1024,
  });
  return {
    hash: Buffer.from(derived).toString("base64"),
    params: { ...SCRYPT_PARAMS, salt: salt.toString("base64") },
  };
}

async function passwordMatches(password, user) {
  if (user.password_algorithm !== "scrypt-v1") return false;
  const salt = Buffer.from(user.password_params?.salt || "", "base64");
  if (!salt.length) return false;
  const candidate = Buffer.from((await passwordHash(password, salt)).hash, "base64");
  const expected = Buffer.from(user.password_hash || "", "base64");
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    active: row.active,
    created_at: row.created_at,
  };
}

export async function authenticate(username, password) {
  const normalized = normalizeUsername(username);
  const result = await query(
    `SELECT id, username, password_hash, password_algorithm, password_params, role, active, created_at
       FROM users WHERE username = $1`,
    [normalized],
  );
  const user = result.rows[0];
  if (!user?.active || !(await passwordMatches(password, user))) return null;
  return publicUser(user);
}

export async function recordLoginEvent({ userId = null, username, succeeded, failureReason = null, ip = null, userAgent = null, requestId = null }) {
  const usernameHash = crypto.createHash("sha256").update(normalizeUsername(username)).digest("hex");
  await query(
    `INSERT INTO login_events (user_id, username_hash, succeeded, failure_reason, ip, user_agent, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, usernameHash, succeeded, failureReason, ip, String(userAgent || "").slice(0, 500) || null, requestId],
  );
}

export async function createSession(user, { ip = null, userAgent = null } = {}) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + config.auth.sessionTtlMs);
  await query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [tokenHash, user.id, expiresAt, ip, String(userAgent || "").slice(0, 500) || null],
  );
  return { token, expiresAt };
}

export async function getSession(token) {
  if (!token) return null;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const result = await query(
    `SELECT s.id AS session_id, u.id, u.username, u.role, u.active, u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.active = true`,
    [tokenHash],
  );
  const row = result.rows[0];
  if (!row) return null;
  await query("UPDATE sessions SET last_seen_at = now() WHERE id = $1", [row.session_id]);
  return publicUser(row);
}

export async function deleteSession(token) {
  if (!token) return;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  await query("UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [tokenHash]);
}

export async function listUsers() {
  const result = await query(
    "SELECT id, username, role, active, created_at FROM users ORDER BY username COLLATE \"C\"",
  );
  return result.rows.map(publicUser);
}

export async function createUser({ username, password, role = "reviewer", createdBy = null }) {
  const normalized = normalizeUsername(username);
  validateAccount({ username: normalized, password, role });
  const passwordData = await passwordHash(password);
  try {
    const result = await query(
      `INSERT INTO users (username, password_hash, password_algorithm, password_params, role, created_by)
       VALUES ($1, $2, 'scrypt-v1', $3::jsonb, $4, $5)
       RETURNING id, username, role, active, created_at`,
      [normalized, passwordData.hash, JSON.stringify(passwordData.params), role, createdBy],
    );
    return publicUser(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      const conflict = new Error("Tên đăng nhập đã tồn tại.");
      conflict.status = 409;
      throw conflict;
    }
    throw error;
  }
}

export async function createInitialAdmin({ username, password }) {
  const normalized = normalizeUsername(username);
  validateAccount({ username: normalized, password, role: "admin" });
  const exists = await query("SELECT id, username, role, active, created_at FROM users WHERE username = $1", [normalized]);
  if (exists.rows[0]) return { user: publicUser(exists.rows[0]), created: false };
  return { user: await createUser({ username: normalized, password, role: "admin" }), created: true };
}
