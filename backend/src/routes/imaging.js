import { Router } from "express";

const router = Router();

// Phase 6 will connect this opaque series endpoint to private S3 Range GET.
router.get("/series/:seriesId/slices", (req, res) => {
  res.status(503).json({ error: "Dịch vụ lát ảnh S3 chưa được cấu hình." });
});

export default router;
