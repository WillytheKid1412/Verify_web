import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import comparisonRouter from "./routes/comparison.js";
import imagingRouter from "./routes/imaging.js";
import authRouter from "./routes/auth.js";
import { config, validateRuntimeConfig } from "./config.js";
import { checkDatabase, closePool } from "./db/pool.js";
import { requireAuth } from "./middleware/auth.js";

validateRuntimeConfig();
const app = express();
if (config.http.trustProxy) app.set("trust proxy", 1);

app.disable("x-powered-by");
app.use((req, res, next) => {
  req.id = req.get("x-request-id") || crypto.randomUUID();
  res.set("X-Request-Id", req.id);
  next();
});
app.use(cors({
  origin: config.http.allowedOrigin || false,
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
}));
app.use(express.json({ limit: "64kb" }));

app.get("/api/health/live", (req, res) => res.json({ ok: true }));
app.get("/api/health/ready", async (req, res) => {
  try {
    await checkDatabase();
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false, error: "Database chưa sẵn sàng" });
  }
});
app.get("/api/health", (req, res) => res.redirect(307, "/api/health/ready"));
app.use("/api/auth", authRouter);
app.use("/api", requireAuth);
app.use("/api/comparison", comparisonRouter);
app.use("/api/imaging", imagingRouter);

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status || 500;
  if (status >= 500) console.error("Request failed", { requestId: req.id, message: error.message });
  const body = { error: status >= 500 ? "Lỗi máy chủ" : error.message, request_id: req.id };
  if (status === 409 && Number.isInteger(error.currentVersion)) body.current_version = error.currentVersion;
  res.status(status).json(body);
});

const server = app.listen(config.port, () => {
  console.log(`Backend đang chạy tại cổng ${config.port}`);
});

async function shutdown(signal) {
  console.log(`Nhận ${signal}, đang dừng an toàn`);
  server.close(async () => {
    await closePool().catch((error) => console.error("Không đóng được PostgreSQL pool", { message: error.message }));
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
