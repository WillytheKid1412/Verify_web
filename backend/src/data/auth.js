import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { query, waitForDatabase } from "./database.js";

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
const LEGACY_USERS_FILE = process.env.LEGACY_USERS_FILE || path.join(DATA_DIR, "users.json");
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const sessions = new Map();

function normalizeUsername(value) {
  return String(value || "").trim().toLocaleLowerCase("vi");
}

function passwordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return { salt, hash };
}

function publicUser(user) {
  return {
    username: user.username,
    role: user.role,
    created_at: user.created_at instanceof Date
      ? user.created_at.toISOString()
      : user.created_at,
  };
}

function readLegacyUsers() {
  try {
    const parsed = JSON.parse(fs.readFileSync(LEGACY_USERS_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function ensureUsersTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'reviewer')),
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    )
  `);
}

async function importLegacyUsers() {
  let imported = 0;
  for (const user of readLegacyUsers()) {
    const username = normalizeUsername(user.username);
    if (
      !username
      || !["admin", "reviewer"].includes(user.role)
      || !user.password_salt
      || !user.password_hash
    ) continue;
    const result = await query(`
      INSERT INTO users (
        username, role, password_salt, password_hash, created_at
      ) VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()))
      ON CONFLICT (username) DO NOTHING
    `, [
      username,
      user.role,
      String(user.password_salt),
      String(user.password_hash),
      user.created_at || null,
    ]);
    imported += result.rowCount;
  }
  if (imported) {
    console.log(`Đã chuyển ${imported} tài khoản từ users.json sang PostgreSQL.`);
  }
}

async function initializeFirstAdmin() {
  const countResult = await query("SELECT COUNT(*)::integer AS count FROM users");
  if (countResult.rows[0].count > 0) return;
  const username = normalizeUsername(process.env.ADMIN_USERNAME);
  const password = String(process.env.ADMIN_PASSWORD || "");
  if (!username || password.length < 12) {
    throw new Error("Chưa có tài khoản. Hãy cấu hình ADMIN_USERNAME và ADMIN_PASSWORD (ít nhất 12 ký tự).");
  }
  const passwordData = passwordHash(password);
  await query(`
    INSERT INTO users (username, role, password_salt, password_hash)
    VALUES ($1, 'admin', $2, $3)
    ON CONFLICT (username) DO NOTHING
  `, [username, passwordData.salt, passwordData.hash]);
  console.log(`Đã khởi tạo tài khoản quản trị trong PostgreSQL: ${username}`);
}

export async function initializeAuth() {
  await waitForDatabase();
  await ensureUsersTable();
  await importLegacyUsers();
  await initializeFirstAdmin();
}

export async function authenticate(username, password) {
  const result = await query(`
    SELECT username, role, password_salt, password_hash, created_at
    FROM users
    WHERE username = $1 AND is_active = TRUE
  `, [normalizeUsername(username)]);
  const user = result.rows[0];
  if (!user) return null;
  const candidate = Buffer.from(passwordHash(password, user.password_salt).hash, "hex");
  const expected = Buffer.from(user.password_hash, "hex");
  if (candidate.length !== expected.length || !crypto.timingSafeEqual(candidate, expected)) return null;
  await query("UPDATE users SET last_login_at = NOW() WHERE username = $1", [user.username]);
  return publicUser(user);
}

export function createSession(user) {
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, { user, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

export function getSession(token) {
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session.user;
}

export function deleteSession(token) {
  sessions.delete(token);
}

export async function listUsers() {
  const result = await query(`
    SELECT username, role, created_at
    FROM users
    ORDER BY username COLLATE "C"
  `);
  return result.rows.map(publicUser);
}

export async function createUser({ username, password, role = "reviewer" }) {
  const normalized = normalizeUsername(username);
  if (!/^[\p{L}\p{N}._-]{3,50}$/u.test(normalized)) {
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
  const passwordData = passwordHash(password);
  try {
    const result = await query(`
      INSERT INTO users (username, role, password_salt, password_hash)
      VALUES ($1, $2, $3, $4)
      RETURNING username, role, created_at
    `, [normalized, role, passwordData.salt, passwordData.hash]);
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
