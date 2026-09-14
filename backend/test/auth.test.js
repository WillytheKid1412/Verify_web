import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test, { after } from "node:test";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
  process.env.DB_SSL_MODE = "disable";
}

const integration = databaseUrl ? test : test.skip;
let auth;
let db;

if (databaseUrl) {
  execFileSync(process.execPath, ["scripts/migrate.js"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl, DB_SSL_MODE: "disable" },
  });
  auth = await import("../src/repositories/authRepository.js");
  db = await import("../src/db/pool.js");
  await db.query("TRUNCATE audit_events, login_events, sessions, review_events, reviews, batch_queries, verification_batches, retrieval_pairs, retrieval_runs, imaging_series, imaging_studies, image_objects, lab_results, ehr_documents, encounters, patients, users RESTART IDENTITY CASCADE");
}

after(async () => {
  if (db) await db.closePool();
});

integration("stores password hashes and persistent opaque sessions in PostgreSQL", async () => {
  const seeded = await auth.createInitialAdmin({ username: "root-admin", password: "strong-password-2026" });
  assert.equal(seeded.created, true);
  assert.equal((await auth.createInitialAdmin({ username: "ROOT-ADMIN", password: "another-password-2026" })).created, false);
  assert.equal(await auth.authenticate("root-admin", "wrong-password"), null);
  const user = await auth.authenticate("ROOT-ADMIN", "strong-password-2026");
  assert.equal(user.role, "admin");

  const session = await auth.createSession(user, { ip: "127.0.0.1", userAgent: "node-test" });
  assert.equal((await auth.getSession(session.token)).id, user.id);
  const stored = await db.query("SELECT password_hash, token_hash FROM users CROSS JOIN sessions LIMIT 1");
  assert.doesNotMatch(stored.rows[0].password_hash, /strong-password-2026/);
  assert.notEqual(stored.rows[0].token_hash, session.token);

  await auth.deleteSession(session.token);
  assert.equal(await auth.getSession(session.token), null);
});

integration("admin creates reviewer accounts with normalized unique usernames", async () => {
  const admin = await auth.authenticate("root-admin", "strong-password-2026");
  const reviewer = await auth.createUser({
    username: "Doctor.01",
    password: "review-password-2026",
    role: "reviewer",
    createdBy: admin.id,
  });
  assert.equal(reviewer.username, "doctor.01");
  assert.equal((await auth.authenticate("DOCTOR.01", "review-password-2026")).role, "reviewer");
  await assert.rejects(
    auth.createUser({ username: "doctor.01", password: "different-password-2026", role: "reviewer" }),
    (error) => error.status === 409,
  );
});
