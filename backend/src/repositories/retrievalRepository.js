import { query } from "../db/pool.js";

function accessClause(actor, offset = 1) {
  if (actor.role === "admin") return { sql: "TRUE", values: [] };
  return { sql: `(bq.reviewer_id IS NULL OR bq.reviewer_id = $${offset})`, values: [actor.id] };
}

async function activeBatch(actor) {
  const requested = process.env.VERIFICATION_BATCH_ID || null;
  const access = accessClause(actor, requested ? 2 : 1);
  const values = requested ? [requested, ...access.values] : access.values;
  const result = await query(
    `SELECT DISTINCT b.id, b.run_id, b.name
       FROM verification_batches b
       JOIN batch_queries bq ON bq.batch_id = b.id
      WHERE b.status = 'active'
        ${requested ? "AND b.id = $1" : ""}
        AND ${access.sql}
      ORDER BY b.id
      LIMIT 1`,
    values,
  );
  return result.rows[0] || null;
}

export async function listQueries(actor) {
  const batch = await activeBatch(actor);
  if (!batch) return { batch: null, queries: [] };
  const access = accessClause(actor, 2);
  const result = await query(
    `SELECT p.id AS patient_id,
            min(rp.query_split) AS split,
            count(rp.id)::integer AS candidate_count,
            bq.display_order
       FROM batch_queries bq
       JOIN patients p ON p.id = bq.query_patient_id
       JOIN verification_batches b ON b.id = bq.batch_id
       JOIN retrieval_pairs rp ON rp.run_id = b.run_id AND rp.query_patient_id = bq.query_patient_id
      WHERE bq.batch_id = $1 AND ${access.sql}
      GROUP BY p.id, bq.display_order
      ORDER BY bq.display_order`,
    [batch.id, ...access.values],
  );
  return { batch, queries: result.rows };
}

export async function getContext(queryPatientId, actor) {
  const batch = await activeBatch(actor);
  if (!batch) return null;
  const access = accessClause(actor, 3);
  const allowed = await query(
    `SELECT 1 FROM batch_queries bq
      WHERE bq.batch_id = $1 AND bq.query_patient_id = $2 AND ${access.sql}`,
    [batch.id, queryPatientId, ...access.values],
  );
  if (!allowed.rowCount) return null;
  const candidates = await query(
    `SELECT rp.id AS pair_id, rp.rank, rp.candidate_patient_id AS patient_id,
            rp.similarity_score, rp.query_split, rp.candidate_split AS related_split,
            rp.shared_primary_icd_groups, rp.observable_overlap,
            r.status, r.note, r.updated_at, r.version, u.username AS reviewer
       FROM retrieval_pairs rp
       LEFT JOIN reviews r ON r.pair_id = rp.id
       LEFT JOIN users u ON u.id = r.reviewer_id
      WHERE rp.run_id = $1 AND rp.query_patient_id = $2 AND rp.rank BETWEEN 1 AND 20
      ORDER BY rp.rank`,
    [batch.run_id, queryPatientId],
  );
  return {
    batch,
    candidates: candidates.rows.map((row) => ({
      pair_id: row.pair_id,
      rank: row.rank,
      patient_id: row.patient_id,
      similarity_score: row.similarity_score,
      query_split: row.query_split || "",
      related_split: row.related_split || "",
      shared_primary_icd_groups: row.shared_primary_icd_groups || [],
      observable_overlap: row.observable_overlap,
      verification: row.status ? {
        status: row.status,
        note: row.note,
        reviewer: row.reviewer,
        at: row.updated_at,
        version: row.version,
      } : null,
    })),
  };
}

export async function findPair(queryPatientId, candidatePatientId, actor) {
  const context = await getContext(queryPatientId, actor);
  if (!context) return null;
  const candidate = context.candidates.find((item) => item.patient_id === candidatePatientId);
  return candidate ? { ...candidate, batch: context.batch } : null;
}
