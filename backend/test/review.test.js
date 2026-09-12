import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test, { after, before } from "node:test";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
  process.env.DB_SSL_MODE = "disable";
}

const integration = databaseUrl ? test : test.skip;
let db;
let saveReview;
let reviewer;
let pairId;

before(async () => {
  if (!databaseUrl) return;
  execFileSync(process.execPath, ["scripts/migrate.js"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl, DB_SSL_MODE: "disable" },
  });
  db = await import("../src/db/pool.js");
  ({ saveReview } = await import("../src/repositories/reviewRepository.js"));
  await db.query("TRUNCATE audit_events, login_events, sessions, review_events, reviews, batch_queries, verification_batches, retrieval_pairs, retrieval_runs, imaging_series, imaging_studies, image_objects, lab_results, ehr_documents, encounters, patients, users RESTART IDENTITY CASCADE");
  reviewer = (await db.query(`INSERT INTO users (username, password_hash, password_algorithm, password_params, role) VALUES ('reviewer', 'hash', 'test', '{}', 'reviewer') RETURNING id, username, role`)).rows[0];
  const patients = (await db.query(`INSERT INTO patients (source_code_ciphertext, source_code_iv, source_code_tag, source_lookup_hash) VALUES ('\\x01', '\\x02', '\\x03', 'q'), ('\\x04', '\\x05', '\\x06', 'c') RETURNING id ORDER BY source_lookup_hash DESC`)).rows;
  const queryPatientId = patients[0].id;
  const candidatePatientId = patients[1].id;
  const runId = (await db.query(`INSERT INTO retrieval_runs (model_name, model_version, source_checksum) VALUES ('model', 'v1', 'checksum') RETURNING id`)).rows[0].id;
  pairId = (await db.query(`INSERT INTO retrieval_pairs (run_id, query_patient_id, candidate_patient_id, rank, similarity_score) VALUES ($1, $2, $3, 1, 0.9) RETURNING id`, [runId, queryPatientId, candidatePatientId])).rows[0].id;
});

after(async () => {
  if (db) await db.closePool();
});

integration("review write, history and audit are atomic with optimistic concurrency", async () => {
  const first = await saveReview({ pairId, reviewer, status: "similar", note: "first", expectedVersion: 0 });
  assert.equal(first.version, 1);
  const second = await saveReview({ pairId, reviewer, status: "very_similar", note: "second", expectedVersion: 1 });
  assert.equal(second.version, 2);
  await assert.rejects(
    saveReview({ pairId, reviewer, status: "uncertain", note: "stale", expectedVersion: 1 }),
    (error) => error.status === 409 && error.currentVersion === 2,
  );
  assert.equal(Number((await db.query("SELECT count(*) FROM review_events WHERE review_id = (SELECT id FROM reviews WHERE pair_id = $1)", [pairId])).rows[0].count), 2);
  assert.equal(Number((await db.query("SELECT count(*) FROM audit_events WHERE resource_id = $1", [pairId])).rows[0].count), 2);
});
