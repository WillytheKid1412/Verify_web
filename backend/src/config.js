import fs from "node:fs";

function integer(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  const value = raw == null || raw === "" ? fallback : Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} phải là số nguyên trong khoảng ${min}-${max}.`);
  }
  return value;
}

function boolean(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  if (["1", "true", "yes"].includes(raw.toLowerCase())) return true;
  if (["0", "false", "no"].includes(raw.toLowerCase())) return false;
  throw new Error(`${name} phải là true hoặc false.`);
}

function sslMode(environment) {
  const value = process.env.DB_SSL_MODE || (environment === "production" ? "verify-full" : "disable");
  if (!["disable", "verify-full"].includes(value)) {
    throw new Error("DB_SSL_MODE chỉ nhận disable hoặc verify-full.");
  }
  return value;
}

function databaseCa() {
  if (process.env.DATABASE_CA_CERT) return process.env.DATABASE_CA_CERT.replaceAll("\\n", "\n");
  if (process.env.DATABASE_CA_CERT_FILE) return fs.readFileSync(process.env.DATABASE_CA_CERT_FILE, "utf8");
  return "";
}

const environment = process.env.NODE_ENV || "development";

export const config = Object.freeze({
  environment,
  production: environment === "production",
  port: integer("PORT", 4000, { max: 65_535 }),
  database: Object.freeze({
    url: process.env.DATABASE_URL || "",
    sslMode: sslMode(environment),
    ca: databaseCa(),
    poolMax: integer("DB_POOL_MAX", 5, { max: 50 }),
    connectionTimeoutMs: integer("DB_CONNECT_TIMEOUT_MS", 5_000, { max: 60_000 }),
    idleTimeoutMs: integer("DB_IDLE_TIMEOUT_MS", 30_000, { max: 600_000 }),
    statementTimeoutMs: integer("DB_STATEMENT_TIMEOUT_MS", 15_000, { max: 300_000 }),
  }),
  auth: Object.freeze({
    sessionTtlMs: integer("SESSION_TTL_MS", 12 * 60 * 60 * 1000, { min: 60_000 }),
    cookieName: process.env.SESSION_COOKIE_NAME || "verify_session",
    cookieSecure: boolean("SESSION_COOKIE_SECURE", environment === "production"),
  }),
  storage: Object.freeze({
    region: process.env.AWS_REGION || "",
    imageBucket: process.env.S3_IMAGE_BUCKET || "",
  }),
  http: Object.freeze({
    allowedOrigin: process.env.ALLOWED_ORIGIN || "",
    trustProxy: boolean("TRUST_PROXY", environment === "production"),
  }),
});

export function validateRuntimeConfig() {
  if (!config.database.url) throw new Error("Thiếu DATABASE_URL.");
  if (config.database.sslMode === "verify-full" && !config.database.ca) {
    throw new Error("DB_SSL_MODE=verify-full yêu cầu DATABASE_CA_CERT hoặc DATABASE_CA_CERT_FILE.");
  }
  if (config.production && !config.http.allowedOrigin) {
    throw new Error("Production yêu cầu ALLOWED_ORIGIN là origin HTTPS của web.");
  }
  if (config.production && (!config.storage.region || !config.storage.imageBucket)) {
    throw new Error("Production yêu cầu AWS_REGION và S3_IMAGE_BUCKET.");
  }
}
