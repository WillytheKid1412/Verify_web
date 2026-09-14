import fs from "fs";
import { Router } from "express";
import { resolveRawNpy } from "../data/rawPatients.js";
import { descriptorInfo, npyHeader } from "../utils/npy.js";

const router = Router();
const MAX_PREVIEW_SIDE = 640;

export function buildSlicePreview({ npyPath, meta }, requestedSlice) {
  const header = npyHeader(npyPath);
  try {
    const { bytesPerValue, readValue } = descriptorInfo(header.descriptor);
    const [depth, height, width] = header.shape.length === 2
      ? [1, header.shape[0], header.shape[1]]
      : [header.shape.at(-3), header.shape.at(-2), header.shape.at(-1)];
    const parsedSlice = Number.parseInt(requestedSlice, 10);
    const slice = Math.max(0, Math.min(depth - 1, Number.isFinite(parsedSlice) ? parsedSlice : Math.floor(depth / 2)));
    const sourceLength = height * width * bytesPerValue;
    const source = Buffer.allocUnsafe(sourceLength);
    fs.readSync(header.fd, source, 0, sourceLength, header.dataOffset + slice * sourceLength);

    const scale = Math.max(width, height) / MAX_PREVIEW_SIDE;
    const previewWidth = Math.max(1, Math.round(width / Math.max(1, scale)));
    const previewHeight = Math.max(1, Math.round(height / Math.max(1, scale)));
    const pixels = Buffer.allocUnsafe(previewWidth * previewHeight);
    const modality = String(meta.Modality || "").toUpperCase();
    const slope = Number.parseFloat(meta.RescaleSlope) || 1;
    const intercept = Number.parseFloat(meta.RescaleIntercept) || 0;
    const values = new Float64Array(previewWidth * previewHeight);
    let min = Infinity;
    let max = -Infinity;
    for (let y = 0; y < previewHeight; y += 1) {
      const sourceY = Math.min(height - 1, Math.floor((y + 0.5) * height / previewHeight));
      for (let x = 0; x < previewWidth; x += 1) {
        const sourceX = Math.min(width - 1, Math.floor((x + 0.5) * width / previewWidth));
        const raw = readValue(source, (sourceY * width + sourceX) * bytesPerValue);
        const value = modality === "CT" ? raw * slope + intercept : raw;
        const index = y * previewWidth + x;
        values[index] = value;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    }
    const low = modality === "CT" ? -1000 : min;
    const high = modality === "CT" ? 1000 : max > min ? max : min + 1;
    for (let index = 0; index < values.length; index += 1) {
      pixels[index] = Math.round(255 * Math.max(0, Math.min(1, (values[index] - low) / (high - low))));
    }
    return { width: previewWidth, height: previewHeight, slice, sliceCount: depth, pixels: pixels.toString("base64") };
  } finally {
    fs.closeSync(header.fd);
  }
}

// Returns an already windowed/downsampled slice. raw.npy itself is never served.
router.get("/slice", (req, res) => {
  const source = resolveRawNpy(req.query);
  if (!source) return res.status(404).json({ error: "Không tìm thấy series hình ảnh" });
  try {
    res.set("Cache-Control", "no-store");
    res.json(buildSlicePreview(source, req.query.slice));
  } catch (error) {
    res.status(422).json({ error: `Không đọc được lát ảnh: ${error.message}` });
  }
});

export default router;
