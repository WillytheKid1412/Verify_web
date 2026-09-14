import { Router } from "express";
import { descriptorInfo } from "../utils/npy.js";
import { getAccessibleSeries } from "../repositories/imagingRepository.js";
import { getObjectRange } from "../storage/s3ImageStore.js";

const router = Router();
const MAX_PREVIEW_SIDE = 640;

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

async function buildSlicePreview(series, requestedSlice, requestedWindow, requestedLevel) {
  const { bytesPerValue, readValue } = descriptorInfo(series.dtype);
  const shape = Array.isArray(series.shape) ? series.shape.map(Number) : [];
  if (shape.length < 2 || shape.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
    throw new Error("Shape của series không hợp lệ.");
  }
  const [depth, height, width] = shape.length === 2
    ? [1, shape[0], shape[1]]
    : [shape.at(-3), shape.at(-2), shape.at(-1)];
  const parsedSlice = Number.parseInt(requestedSlice, 10);
  const slice = Math.max(0, Math.min(depth - 1, Number.isFinite(parsedSlice) ? parsedSlice : Math.floor(depth / 2)));
  const sourceLength = height * width * bytesPerValue;
  if (!Number.isSafeInteger(sourceLength) || sourceLength <= 0 || sourceLength > 256 * 1024 * 1024) {
    throw new Error("Kích thước lát ảnh vượt giới hạn.");
  }
  const start = Number(series.data_offset) + slice * sourceLength;
  const { bytes: source } = await getObjectRange({
    bucket: series.bucket,
    key: series.object_key,
    versionId: series.version_id,
    start,
    length: sourceLength,
  });

  const scale = Math.max(width, height) / MAX_PREVIEW_SIDE;
  const previewWidth = Math.max(1, Math.round(width / Math.max(1, scale)));
  const previewHeight = Math.max(1, Math.round(height / Math.max(1, scale)));
  const values = new Float64Array(previewWidth * previewHeight);
  const slope = Number(series.rescale_slope) || 1;
  const intercept = Number(series.rescale_intercept) || 0;
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < previewHeight; y += 1) {
    const sourceY = Math.min(height - 1, Math.floor((y + 0.5) * height / previewHeight));
    for (let x = 0; x < previewWidth; x += 1) {
      const sourceX = Math.min(width - 1, Math.floor((x + 0.5) * width / previewWidth));
      const raw = readValue(source, (sourceY * width + sourceX) * bytesPerValue);
      const value = raw * slope + intercept;
      const index = y * previewWidth + x;
      values[index] = value;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }

  const defaultWindow = series.modality === "CT" ? 2000 : Math.max(1, max - min);
  const defaultLevel = series.modality === "CT" ? 0 : (max + min) / 2;
  const window = boundedNumber(requestedWindow, defaultWindow, 1, 20_000);
  const level = boundedNumber(requestedLevel, defaultLevel, -20_000, 20_000);
  const low = level - window / 2;
  const high = level + window / 2;
  const pixels = Buffer.allocUnsafe(previewWidth * previewHeight);
  for (let index = 0; index < values.length; index += 1) {
    pixels[index] = Math.round(255 * Math.max(0, Math.min(1, (values[index] - low) / (high - low))));
  }
  return {
    width: previewWidth,
    height: previewHeight,
    slice,
    sliceCount: depth,
    window,
    level,
    pixels: pixels.toString("base64"),
  };
}

router.get("/series/:seriesId/slices", async (req, res, next) => {
  try {
    const series = await getAccessibleSeries(req.params.seriesId, req.user);
    if (!series) return res.status(404).json({ error: "Không tìm thấy series được phân quyền." });
    const preview = await buildSlicePreview(series, req.query.slice, req.query.window, req.query.level);
    res.set("Cache-Control", "private, no-store").json(preview);
  } catch (error) {
    if (/Shape|Kích thước|dtype|Byte range/.test(error.message)) error.status = 422;
    next(error);
  }
});

export default router;
