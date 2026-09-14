import { query } from "../db/pool.js";

export async function getAccessibleSeries(seriesId, actor) {
  const requestedBatch = process.env.VERIFICATION_BATCH_ID || null;
  const result = await query(
    `SELECT se.id, se.dtype, se.shape, se.slice_count, se.data_offset,
            se.rescale_slope, se.rescale_intercept, st.modality,
            io.bucket, io.object_key, io.version_id
       FROM imaging_series se
       JOIN imaging_studies st ON st.id = se.study_id
       JOIN encounters e ON e.id = st.encounter_id
       JOIN image_objects io ON io.id = se.image_object_id
      WHERE se.id = $1
        AND io.storage_status = 'verified'
        AND EXISTS (
          SELECT 1
            FROM verification_batches b
            JOIN batch_queries bq ON bq.batch_id = b.id
           WHERE b.status = 'active'
             AND ($2::uuid IS NULL OR b.id = $2::uuid)
             AND ($3 = 'admin' OR bq.reviewer_id IS NULL OR bq.reviewer_id = $4)
             AND (
               bq.query_patient_id = e.patient_id
               OR EXISTS (
                 SELECT 1 FROM retrieval_pairs rp
                  WHERE rp.run_id = b.run_id
                    AND rp.query_patient_id = bq.query_patient_id
                    AND rp.candidate_patient_id = e.patient_id
               )
             )
        )`,
    [seriesId, requestedBatch, actor.role, actor.id],
  );
  return result.rows[0] || null;
}
