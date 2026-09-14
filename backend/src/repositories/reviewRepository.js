import { query, withTransaction } from "../db/pool.js";
import { recordAudit } from "./auditRepository.js";

function publicReview(row) {
  if (!row) return null;
  return {
    status: row.status,
    note: row.note,
    reviewer: row.reviewer,
    at: row.updated_at,
    version: row.version,
  };
}

export async function getReview(pairId) {
  const result = await query(
    `SELECT r.status, r.note, r.updated_at, r.version, u.username AS reviewer
       FROM reviews r JOIN users u ON u.id = r.reviewer_id WHERE r.pair_id = $1`,
    [pairId],
  );
  return publicReview(result.rows[0]);
}

export async function saveReview({ pairId, reviewer, status, note, expectedVersion, requestId = null, ip = null }) {
  return withTransaction(async (client) => {
    const existingResult = await client.query(
      `SELECT r.*, u.username AS reviewer
         FROM reviews r JOIN users u ON u.id = r.reviewer_id
        WHERE r.pair_id = $1 FOR UPDATE OF r`,
      [pairId],
    );
    const existing = existingResult.rows[0];
    const expected = Number(expectedVersion);
    const actual = existing?.version || 0;
    if (!Number.isInteger(expected) || expected !== actual) {
      const conflict = new Error("Kết quả đã được thay đổi ở phiên khác. Hãy tải lại trước khi lưu.");
      conflict.status = 409;
      conflict.currentVersion = actual;
      throw conflict;
    }

    const savedResult = existing
      ? await client.query(
        `UPDATE reviews
            SET reviewer_id = $2, status = $3, note = $4, version = version + 1, updated_at = now()
          WHERE id = $1
          RETURNING id, status, note, updated_at, version`,
        [existing.id, reviewer.id, status, note || ""],
      )
      : await client.query(
        `INSERT INTO reviews (pair_id, reviewer_id, status, note)
         VALUES ($1, $2, $3, $4)
         RETURNING id, status, note, updated_at, version`,
        [pairId, reviewer.id, status, note || ""],
      );
    const saved = savedResult.rows[0];
    await client.query(
      `INSERT INTO review_events
         (review_id, actor_id, previous_status, new_status, previous_note, new_note, request_id, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [saved.id, reviewer.id, existing?.status || null, status, existing?.note || null, note || "", requestId, ip],
    );
    await recordAudit({
      actorId: reviewer.id,
      action: "review.saved",
      resourceType: "retrieval_pair",
      resourceId: pairId,
      metadata: { previousVersion: actual, version: saved.version, status },
      requestId,
      ip,
    }, client);
    return publicReview({ ...saved, reviewer: reviewer.username });
  });
}
