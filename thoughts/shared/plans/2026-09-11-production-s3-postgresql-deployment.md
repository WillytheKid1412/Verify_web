# Production S3 + PostgreSQL Deployment Implementation Plan

## Overview

Chuyển ứng dụng xác minh bệnh nhân từ mô hình demo dùng filesystem/JSON sang mô hình triển khai thật: trả về Top-20 cho mỗi query, lưu toàn bộ volume ảnh 300–400 GB trong Amazon S3 private, lưu metadata/EHR/lab/retrieval/tài khoản/đánh giá/audit trong PostgreSQL trên máy cá nhân của chủ hệ thống, và chạy frontend/backend trên cloud server.

Do PostgreSQL không hoạt động 24/7, hệ thống được thiết kế như một dịch vụ có lịch hoạt động. Khi máy PostgreSQL tắt hoặc VPN mất kết nối, backend phải fail closed và giao diện hiển thị trạng thái bảo trì; không cho phép đăng nhập, xem dữ liệu hoặc tiếp tục bằng dữ liệu cache cũ.

Mọi dữ liệu được coi là dữ liệu y tế nhạy cảm cho đến khi có quy trình xác nhận khử định danh.

## Current State Analysis

- Backend đọc user từ `DATA_DIR/users.json` và giữ session trong RAM tại `backend/src/data/auth.js`.
- Kết quả đánh giá được đọc/ghi toàn bộ qua `verifications.json` tại `backend/src/data/store.js`, có nguy cơ lost update và không có lịch sử bất biến.
- EHR, lab, study, series và `raw.npy` được duyệt trực tiếp từ `RAW_ROOT` tại `backend/src/data/rawPatients.js`.
- Danh sách query lấy từ JSON, Top-K được parse từ CSV trong mỗi process tại `backend/src/data/comparison.js`; mã hiện giới hạn đúng 5 query và rank 1–5.
- `backend/src/routes/imaging.js` mở NPY cục bộ, đọc một lát, window về 8-bit rồi trả base64 JSON.
- Frontend lưu bearer token trong `localStorage` tại `frontend/src/api.js`.
- `backend/src/server.js` đang bật CORS cho mọi origin và public `/sample` trước middleware xác thực.
- `backend/src/routes/patients.js` vẫn cung cấp API dữ liệu giả song song với API comparison.
- Viewer tại `frontend/src/components/ScanViewport.jsx` đã có đổi lát, pan và zoom nhưng chưa có window/level động đầy đủ.

## Desired End State

```text
Browser
  │ HTTPS: https://verify.example.com
  ▼
Nginx/Caddy trên cloud server
  ├── /          → frontend static
  └── /api/*     → Node.js backend (private localhost/container network)
                         │
                         ├── Tailscale/WireGuard + PostgreSQL TLS
                         │      → PostgreSQL trên máy cá nhân
                         │
                         └── AWS SDK + IAM least privilege
                                → S3 private, cùng region với cloud server nếu có thể
```

- Mỗi query trả đúng rank 1–20 từ một retrieval run/version cụ thể.
- Mọi patient/record/study/series sử dụng UUID opaque ở API; mã bệnh nhân thật không xuất hiện trong URL hoặc S3 key.
- Clinical metadata, EHR, lab, retrieval, user, session, review và audit nằm trong PostgreSQL.
- Mỗi series ảnh vẫn giữ toàn bộ lát. Giai đoạn đầu lưu một NPY C-contiguous không nén cho mỗi series trên S3 và dùng `Range GET` để chỉ lấy đúng byte range của lát cần xem.
- Backend xác thực quyền theo batch/query/pair trước khi đọc S3, áp dụng slope/intercept và window/level, rồi trả ảnh nhị phân; không tải cả volume về server cho mỗi request.
- Tài khoản dùng session cookie opaque `HttpOnly`, `Secure`, `SameSite=Strict`; database chỉ lưu hash token.
- Admin mới được tạo tài khoản và export; mọi lần xem hồ sơ/series, đánh giá, quản trị và export có audit trail.
- Khi PostgreSQL offline, `/api/health/live` vẫn phản ánh process sống nhưng `/api/health/ready` trả 503; mọi API dữ liệu fail closed.

### Key Decisions

- Chấp nhận hệ thống không khả dụng khi máy PostgreSQL tắt; không giả lập tính sẵn sàng 24/7.
- Dùng backend S3 Range proxy trong phiên bản đầu, không phát presigned URL cho toàn bộ NPY. Cách này ít thay đổi viewer hơn, kiểm soát quyền/audit theo lát tốt hơn và không trao khả năng tải nguyên volume qua một URL.
- Không tách mỗi lát thành một object S3 ở giai đoạn đầu, tránh số lượng object và pipeline chuyển đổi quá lớn.
- Chỉ chuyển sang Zarr/DICOMweb/CloudFront sau load test nếu Range GET trên NPY không đạt yêu cầu.
- PostgreSQL không được public port 5432; kết nối duy nhất qua tailnet/VPN và TLS.

## What We Are NOT Doing

- Không cam kết uptime 24/7 khi PostgreSQL chạy trên máy cá nhân.
- Không làm viewer 3D/MPR hoàn chỉnh trong lần migration đầu; phạm vi là duyệt toàn bộ lát axial hiện có, pan, zoom và window/level.
- Không public S3 bucket hoặc để frontend giữ AWS credentials.
- Không đưa mã bệnh nhân, chẩn đoán, record ID thật vào S3 object key.
- Không dùng S3 versioning thay cho backup độc lập.
- Không đưa dữ liệu thật lên staging trước khi hoàn thành security review và kiểm thử restore.
- Không tiếp tục sử dụng CSV/JSON/filesystem làm source of truth khi production đã cutover.

## Data Model

### Identity and access

- `users`: UUID, username dạng case-insensitive unique, password hash versioned, role, active flag, created-by, timestamps.
- `sessions`: UUID, SHA-256 token hash, user FK, expiry, revoked time, IP, user agent, timestamps.
- `login_events`: actor/username hash, success/failure, IP, user agent, request ID, timestamp.

### Clinical catalogue

- `patients`: opaque UUID, encrypted source patient code, HMAC lookup hash, age/gender fields cần hiển thị, timestamps.
- `encounters`: UUID, patient FK, encrypted source record code, encounter dates.
- `ehr_documents`: encounter FK, version, normalized JSONB content, source checksum.
- `lab_results`: encounter FK, test code/name, value, unit, reference range, abnormal flag, sample, department, result time.
- `imaging_studies`: encounter FK, modality, encrypted accession identifier, study time.
- `imaging_series`: study FK, description, dtype, shape, slice count, byte order, NPY data offset, slope/intercept, S3 object FK.
- `image_objects`: UUID, bucket, opaque key, S3 version ID, byte size, SHA-256/checksum, storage status.

### Retrieval and review

- `retrieval_runs`: UUID, model/version, source artifact checksum, created time.
- `retrieval_pairs`: run FK, query patient FK, candidate patient FK, rank with constraint 1–20, similarity score, ICD overlap JSONB, unique `(run_id, query_patient_id, rank)`.
- `verification_batches`: UUID, run FK, name, status, timestamps.
- `batch_queries`: batch/query relation and display order.
- `reviews`: pair FK unique, current reviewer FK, status, note, optimistic-lock version, timestamps.
- `review_events`: append-only old/new values, actor, request ID, IP, timestamp.
- `audit_events`: append-only actor, action, resource type/UUID, metadata JSONB, IP, request ID, timestamp.

Clinical identifier encryption keys must live outside PostgreSQL, preferably in a secret manager/KMS-backed configuration. The database, WAL and every backup must be encrypted at rest.

## Phase 1: Infrastructure and Network Baseline

### Changes Required

1. Provision one production cloud server, preferably EC2 in the same AWS region as S3; start with 2–4 vCPU, 4–8 GB RAM and encrypted system disk.
2. Install Docker, Compose, firewall, automatic security updates, Nginx/Caddy and monitoring agent.
3. Expose only TCP 80/443 publicly; SSH only by VPN or restricted administration IP.
4. Put frontend and backend behind one domain so browser calls same-origin `/api`.
5. Install Tailscale or WireGuard on both cloud server and PostgreSQL machine.
6. Give the cloud backend a stable VPN identity/tag and permit only backend → PostgreSQL:5432.
7. Configure PostgreSQL to listen on localhost plus its VPN address; use `hostssl`, SCRAM-SHA-256 and an exact `/32` rule in `pg_hba.conf`.
8. Issue a PostgreSQL server certificate whose hostname matches the VPN DNS name; backend uses `sslmode=verify-full` with the private CA.
9. Define an operating schedule and disable sleep on the PostgreSQL machine only during that schedule.

### Success Criteria

#### Automated Verification

- [ ] Public scan shows only 80/443; port 5432 is unreachable from the Internet.
- [ ] Cloud server resolves the VPN DB hostname and completes a TLS `verify-full` PostgreSQL connection.
- [ ] A non-approved tailnet identity cannot reach port 5432.
- [ ] `/api/health/live` returns 200 when Node is alive.
- [ ] `/api/health/ready` returns 503 within a bounded timeout when PostgreSQL is off.

#### Manual Verification

- [ ] Turning the local PostgreSQL machine off causes a clear maintenance screen, not stale clinical data.
- [ ] Turning it back on restores service without changing public DNS or opening router ports.
- [ ] The operator can identify the DB/VPN failure from logs and monitoring.

**Implementation Note**: Stop for manual confirmation of VPN, TLS and fail-closed behavior before importing any clinical data.

## Phase 2: Private S3 Foundation

### Changes Required

1. Create separate buckets/prefixes for production images and audit/backup artifacts according to the retention policy.
2. Enable all four S3 Block Public Access settings and bucket-owner-enforced Object Ownership.
3. Enable versioning and SSE-KMS with a customer-managed symmetric KMS key; enable S3 Bucket Key.
4. Add a bucket policy denying non-TLS requests.
5. If backend is EC2, attach an instance role. If it is outside AWS, use a dedicated least-privilege IAM principal as a transitional option and rotate its access key.
6. Runtime backend role receives only `s3:GetObject`, `s3:GetObjectVersion` and needed KMS decrypt permissions on the production image prefix.
7. Ingest identity receives upload/checksum permissions but runtime backend receives no delete permission.
8. Enable CloudTrail S3 data events where required and place logs where runtime cannot delete them.
9. Use opaque keys such as `prod/series/<series_uuid>/volume.npy`.
10. Set lifecycle only after measuring access; active viewer objects stay in S3 Standard. Archive original/non-active copies separately rather than archiving objects required by the viewer.

### Success Criteria

#### Automated Verification

- [ ] AWS public-access checks report no public bucket/object access.
- [ ] HTTP/non-TLS S3 access is denied.
- [ ] Runtime role can read its prefix but cannot put/delete objects.
- [ ] Ingest role can upload and verify checksum but cannot alter IAM/bucket policy.
- [ ] A test object has KMS encryption, version ID, checksum and an audit event.

#### Manual Verification

- [ ] No patient code or diagnosis appears in bucket name, key or AWS console object path.
- [ ] Key rotation/revocation procedure is documented and rehearsed.

## Phase 3: PostgreSQL Schema, Migrations and Repositories

### Changes Required

#### New backend modules

- `backend/src/config.js`: typed validation for DB, S3, cookie, origin and runtime settings.
- `backend/src/db/pool.js`: `pg.Pool` with 5 connections initially, connect/query/idle timeouts and graceful shutdown.
- `backend/src/db/migrations/*.sql`: versioned schema and indexes.
- `backend/src/repositories/authRepository.js`
- `backend/src/repositories/patientRepository.js`
- `backend/src/repositories/retrievalRepository.js`
- `backend/src/repositories/reviewRepository.js`
- `backend/src/repositories/auditRepository.js`

#### Existing modules

- Replace file logic in `backend/src/data/auth.js`, `store.js` and `rawPatients.js` with async repositories.
- Convert comparison functions and all route handlers to `async/await`.
- Keep pure overlap calculations in `comparison.js` separate from database access and unit-testable.
- Convert initial admin creation into an explicit, idempotent seed command; do not silently create credentials on every process boot.
- Use separate DB roles: migration owner, runtime read/write role and backup role.
- Add transaction boundaries for review upsert + append-only review event + audit event.

### Success Criteria

#### Automated Verification

- [ ] Migrations apply to an empty database and rollback/rebuild cleanly in staging.
- [ ] Runtime DB role cannot execute DDL or read password/session token material beyond required queries.
- [ ] Concurrent review writes do not lose data; stale versions return HTTP 409.
- [ ] Password plaintext and raw session tokens never appear in PostgreSQL.
- [ ] Repository integration tests run against a temporary PostgreSQL database.

#### Manual Verification

- [ ] Admin can create/disable a reviewer and reviewer permissions update immediately.
- [ ] Review history shows actor and prior value after an edit.

## Phase 4: Idempotent Import Pipeline and Top-20

### Changes Required

1. Create `backend/scripts/import-clinical-data.js` to parse local EHR/lab/meta and upsert by source checksum.
2. Create `backend/scripts/import-retrieval.js` to import CSV into `retrieval_runs` and `retrieval_pairs`.
3. Remove hardcoded `QUERY_LIMIT=5` and `CANDIDATE_LIMIT=5`; batch configuration in PostgreSQL selects queries, and API returns ranks 1–20.
4. Reject a query/run if ranks are duplicated, outside 1–20 or incomplete when the batch requires exactly 20.
5. Create `backend/scripts/upload-imaging.js`:
   - validate NPY magic/header, supported dtype and C-contiguous order;
   - compute SHA-256 and size;
   - allocate opaque study/series/image UUIDs;
   - multipart upload to S3 with retry/resume;
   - record bucket/key/version/checksum and parsed header fields in PostgreSQL;
   - change status from `pending` → `uploaded` → `verified` only after S3 HEAD/checksum verification.
6. Create a reconciliation command comparing source manifest, PostgreSQL rows and S3 objects.
7. Upload 300–400 GB with AWS CLI/DataSync or the resumable ingest script, not the browser console.

### Success Criteria

#### Automated Verification

- [ ] Re-running import creates no duplicate patients, encounters, series or retrieval pairs.
- [ ] Every active query has exactly ranks 1–20 in order.
- [ ] Reconciliation reports equal file count, total bytes and checksums between source manifest, DB and S3.
- [ ] Interrupted multipart upload resumes or is safely cleaned up.
- [ ] No source patient/record identifier appears in an S3 key.

#### Manual Verification

- [ ] A sample query displays the same Top-20 order and scores as the source CSV.
- [ ] Randomly sampled EHR, lab and imaging metadata match the source artifacts.

**Implementation Note**: Import de-identified staging data first. Do not run the full production upload until reconciliation passes.

## Phase 5: Full-Slice S3 Viewer Service

### Changes Required

1. Add `backend/src/storage/s3ImageStore.js` using AWS SDK v3.
2. On first series request, read/validate the NPY header or use the verified header fields already stored in PostgreSQL.
3. For slice `i`, calculate the C-order byte range from `data_offset + i * height * width * bytes_per_value` and call S3 `GetObject` with exactly that Range.
4. Reject unsupported dtype, Fortran order, invalid dimensions and out-of-range indices during import, not during normal viewing.
5. Change endpoint to opaque IDs, for example:

```text
GET /api/imaging/series/:seriesId/slices/:sliceIndex?window=400&level=40
```

6. Authorize that current user is assigned to the active verification batch/pair before any S3 call.
7. Apply rescale slope/intercept and validated window/level server-side; return binary PNG/WebP rather than base64 JSON.
8. Add strict bounds for window, level, dimensions, response size and request rate.
9. Cache only non-clinical parsed technical headers in a small in-memory LRU. Do not serve image data after DB authorization becomes unavailable.
10. Record series-open/image-access audit events with request ID; aggregate rapid slice scrolling to avoid one PostgreSQL row per wheel event.
11. Update `frontend/src/components/ScanViewport.jsx` to load blobs, prefetch adjacent slices, cancel stale requests, expose window/level controls and retain pan/zoom.
12. Preserve all available slices from `slice_count`; remove demo truncation assumptions.

### Performance Gate

- Initial target: p95 first slice under 1.5 seconds and p95 adjacent slice under 500 ms for the expected concurrent reviewers.
- If this fails, evaluate chunked Zarr (8–16 adjacent slices/chunk), a dedicated image service, or DICOMweb/OHIF if original DICOM can be preserved.
- CloudFront signed cookies/URLs are a later optimization only after access-control and caching behavior are reviewed.

### Success Criteria

#### Automated Verification

- [ ] S3 test verifies correct byte ranges for first, middle and last slice across every supported dtype.
- [ ] Backend never downloads the full NPY object for a single slice request.
- [ ] Unauthorized users and users assigned to another batch receive 403 before S3 access.
- [ ] Invalid series/slice/window inputs return controlled 4xx responses without internal paths/keys.
- [ ] Returned image dimensions/pixel values match local reference rendering within accepted tolerance.
- [ ] Load test meets the performance gate without exhausting DB pool or Node memory.

#### Manual Verification

- [ ] Reviewer can scroll from slice 1 through the final slice for CT/MRI.
- [ ] Pan, zoom, reset and window/level remain responsive on representative large series.
- [ ] Losing PostgreSQL connectivity while viewing blocks new slice access and displays maintenance state.

## Phase 6: Authentication, Authorization and Audit Hardening

### Changes Required

1. Replace localStorage bearer tokens with opaque session cookies: `HttpOnly`, `Secure`, `SameSite=Strict`, narrow path and fixed expiry.
2. Store only SHA-256 session token hashes; support revocation, account disablement and session expiry cleanup.
3. Use Argon2id or asynchronous parameterized scrypt with a version field; rate-limit login and add progressive delay/temporary lockout.
4. Require MFA for admin accounts before production data is available.
5. Add CSRF protection/Origin validation for state-changing requests.
6. Apply case-level authorization, not only `role === reviewer`.
7. Keep admin-only enforcement for user management and CSV/JSON export on backend routes.
8. Add `helmet`, explicit CORS/same-origin policy, request body/note length limits, request IDs and sanitized errors.
9. Remove public `/sample` routes and remove/disable the legacy synthetic `/api/patients` API.
10. Prevent CSV formula injection for cells beginning with `=`, `+`, `-` or `@`.
11. Audit login, patient/encounter open, series open, review changes, user administration and exports.

### Success Criteria

#### Automated Verification

- [ ] Browser JavaScript cannot read the session cookie.
- [ ] CSRF, IDOR, role-bypass and brute-force tests pass.
- [ ] Reviewer cannot create users or export through direct API calls.
- [ ] `/sample` and legacy data routes are absent in production.
- [ ] CSV payloads cannot execute spreadsheet formulas.
- [ ] Disabling a user revokes active sessions.

#### Manual Verification

- [ ] Admin MFA enrollment/recovery is documented and tested.
- [ ] Audit search can reconstruct who viewed/exported/changed a case and when.

## Phase 7: Deployment, Observability and Backup

### Changes Required

1. Produce production Compose/systemd manifests with pinned images, non-root containers, read-only root filesystem where possible, resource limits and graceful shutdown.
2. Run frontend and API behind the same HTTPS hostname; backend port remains private.
3. Store `DATABASE_URL`, cookie secrets, encryption keys and AWS configuration in a cloud secret manager/environment, never in Git.
4. Add structured logs with request IDs and redact cookies, authorization headers, presigned URLs, patient codes, EHR and notes.
5. Monitor API latency/error rate, DB readiness, VPN status, S3 errors, pool saturation, disk/backup status and authentication anomalies.
6. Configure an explicit maintenance window matching PostgreSQL availability; frontend handles 503 with a Vietnamese maintenance message.
7. Backup policy baseline:
   - daily encrypted `pg_dump -Fc` whenever the DB host is online;
   - encrypted full/base backup plus WAL/PITR if review loss is unacceptable;
   - at least one offline or off-site encrypted copy;
   - credentials for deleting production must not be able to delete backups.
8. Set initial objectives appropriate to the non-24/7 design: RPO 24 hours, RTO 4 hours during the operating window, then tighten if needed.
9. Test restore into an isolated staging database quarterly and before major migrations.

### Success Criteria

#### Automated Verification

- [ ] Production images build reproducibly and vulnerability scans have no unresolved critical/high findings.
- [ ] Secrets and PHI do not appear in repository history, image layers or logs.
- [ ] Monitoring alerts when DB/VPN/S3/readiness fails during operating hours.
- [ ] Backup job verifies archive integrity and retention.

#### Manual Verification

- [ ] A clean server can be restored from runbook, DB backup and S3 catalogue.
- [ ] Restore drill meets RTO/RPO.
- [ ] Operator can intentionally enter/exit maintenance mode without exposing partial data.

## Phase 8: Staging, Security Review and Cutover

### Changes Required

1. Deploy an isolated staging environment using synthetic or formally de-identified data.
2. Run unit, repository integration, API authorization, S3 Range, browser E2E, load and failure-injection tests.
3. Review data classification, consent/retention/deletion requirements and applicable healthcare/privacy obligations before real patient data enters AWS.
4. Test DB-off, VPN-off, S3-denied, KMS-denied, expired session, revoked user and partial upload scenarios.
5. Freeze source artifact versions, run final import/reconciliation, take pre-cutover backup and switch DNS.
6. Retain a rollback window in which the old system is read-only; never allow reviews to be written concurrently to both stores.

### Success Criteria

#### Automated Verification

- [ ] All Top-20, RBAC, S3, DB and E2E test suites pass in staging.
- [ ] Reconciliation has zero missing/mismatched objects and rows.
- [ ] Failure injection always fails closed without leaking cached data.
- [ ] Performance meets the full-slice viewer gate at target concurrency.

#### Manual Verification

- [ ] Clinicians accept Top-20 ordering, comparison alignment and full-slice viewer behavior.
- [ ] Security review signs off on S3, network, auth, audit, logs and backup.
- [ ] Restore and rollback runbooks have been exercised by someone other than the implementer.

## Testing Strategy

### Unit Tests

- Pure EHR/lab overlap logic and Top-20 rank validation.
- NPY header/dtype/offset/range calculation and window/level conversion.
- Password/session hashing, expiry and authorization policies.
- CSV export escaping and formula neutralization.

### Integration Tests

- PostgreSQL repositories against an isolated test database.
- S3 adapter against a dedicated test bucket or LocalStack, plus at least one AWS staging test.
- Atomic review write + review event + audit event.
- Import idempotency and source/DB/S3 reconciliation.
- VPN/TLS database connection and readiness behavior.

### End-to-End Scenarios

- Admin login/MFA, create/disable reviewer, export and audit.
- Reviewer opens assigned query, sees exactly Top-20, reviews all candidates and cannot access another batch.
- Full CT/MRI scroll, adjacent slice prefetch, cancellation, window/level, pan and zoom.
- PostgreSQL shutdown during login/view/review and recovery after restart.
- S3/KMS denial, missing object/version and malformed NPY.

## Operational Direction

- This architecture is acceptable for a scheduled research/demo system. It is not highly available while PostgreSQL remains on a non-24/7 personal machine.
- The first infrastructure improvement, when budget permits, should be moving PostgreSQL to a managed service or an always-on dedicated on-prem server with UPS and monitored connectivity. That change gives more reliability than optimizing S3/CDN first.
- For 300–400 GB, browser-console upload is not an operational workflow. Use a resumable/checksummed ingest process and preserve a manifest for reconciliation.
- Keep S3 and cloud compute in the same AWS region when possible; choose region only after confirming data-residency requirements.
- Treat full-volume image delivery as a measured performance problem: start with NPY Range GET, observe real p95 and migrate to Zarr/DICOMweb only when metrics justify it.

## References

- AWS S3 security best practices: https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html
- AWS S3 Block Public Access: https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html
- AWS SSE-KMS: https://docs.aws.amazon.com/AmazonS3/latest/userguide/specifying-kms-encryption.html
- AWS S3 Bucket Keys: https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-key.html
- AWS S3 lifecycle: https://docs.aws.amazon.com/AmazonS3/latest/userguide/intro-lifecycle-rules.html
- AWS CloudTrail S3 data events: https://docs.aws.amazon.com/AmazonS3/latest/userguide/cloudtrail-logging-s3-info.html
- AWS IAM temporary credentials: https://docs.aws.amazon.com/IAM/latest/UserGuide/securing_access-keys.html
- PostgreSQL TLS: https://www.postgresql.org/docs/current/ssl-tcp.html
- PostgreSQL `pg_hba.conf`: https://www.postgresql.org/docs/current/auth-pg-hba-conf.html
- PostgreSQL SCRAM-SHA-256: https://www.postgresql.org/docs/current/auth-password.html
- PostgreSQL backup and restore: https://www.postgresql.org/docs/current/backup.html
- PostgreSQL PITR: https://www.postgresql.org/docs/current/continuous-archiving.html
- node-postgres pooling: https://node-postgres.com/features/pooling
- Tailscale server setup: https://tailscale.com/kb/1245/set-up-servers
- Tailscale Grants: https://tailscale.com/docs/features/access-control/grants
