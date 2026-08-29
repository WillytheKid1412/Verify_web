import express from "express";
import cors from "cors";
import patientsRouter from "./routes/patients.js";
import comparisonRouter from "./routes/comparison.js";
import imagingRouter from "./routes/imaging.js";
import path from "path";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
const sampleDataDir = process.env.SAMPLE_DATA_DIR || path.resolve(process.cwd(), "../sample_data");
// Tên thư mục export preview có timestamp; API giữ một URL ổn định cho frontend.
app.use("/sample/previews", express.static(path.join(sampleDataDir, "sample_previews_24179852_20260829_152459")));
app.use("/sample", express.static(sampleDataDir));

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/patients", patientsRouter);
app.use("/api/comparison", comparisonRouter);
app.use("/api/imaging", imagingRouter);

app.listen(PORT, () => {
  console.log(`Backend đang chạy tại http://localhost:${PORT}`);
});
