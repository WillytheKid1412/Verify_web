import express from "express";
import cors from "cors";
import patientsRouter from "./routes/patients.js";
import comparisonRouter from "./routes/comparison.js";
import imagingRouter from "./routes/imaging.js";
import authRouter from "./routes/auth.js";
import { initializeAdmin } from "./data/auth.js";
import { requireAuth } from "./middleware/auth.js";
import path from "path";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
initializeAdmin();
const sampleDataDir = process.env.SAMPLE_DATA_DIR || path.resolve(process.cwd(), "../sample_data");
// Tên thư mục export preview có timestamp; API giữ một URL ổn định cho frontend.
app.use("/sample/previews", express.static(path.join(sampleDataDir, "sample_previews_24179852_20260829_152459")));
app.use("/sample", express.static(sampleDataDir));

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api", requireAuth);
app.use("/api/patients", patientsRouter);
app.use("/api/comparison", comparisonRouter);
app.use("/api/imaging", imagingRouter);

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: error.message || "Lỗi máy chủ" });
});

app.listen(PORT, () => {
  console.log(`Backend đang chạy tại http://localhost:${PORT}`);
});
