# Production AWS S3 + RDS PostgreSQL Deployment Plan

## Overview

Triển khai ứng dụng xác minh bệnh nhân thành một hệ thống cloud hoạt động độc lập với máy cá nhân:

- Frontend và Node.js backend chạy trên cloud server, mặc định chọn Amazon EC2 để nằm cùng AWS với dữ liệu.
- Toàn bộ volume ảnh CT/MRI/XQ, dự kiến 300–400 GB, nằm trong Amazon S3 private.
- Metadata, EHR, lab, retrieval Top-20, tài khoản, password hash, session, kết quả review và audit nằm trong Amazon RDS for PostgreSQL.
- PostgreSQL không public ra Internet. Backend truy cập database trong private VPC; DBeaver chỉ quản trị qua VPN hoặc AWS Systems Manager port forwarding.
- Browser không truy cập trực tiếp NPY hay AWS credentials. Backend kiểm tra quyền rồi đọc đúng byte range của lát ảnh từ S3, window/level và trả ảnh nhị phân.

Plan này thay thế `2026-09-11-production-s3-postgresql-deployment.md`, cụ thể bỏ thiết kế PostgreSQL chạy trên máy cá nhân và bỏ chế độ vận hành phụ thuộc lịch bật máy.

Mọi dữ liệu được coi là dữ liệu y tế nhạy cảm cho đến khi có xác nhận chính thức rằng dữ liệu đã được khử định danh và đáp ứng yêu cầu pháp lý/tổ chức.

## Recommended Architecture

```text
Internet
   │ HTTPS 443
   ▼
verify.example.com
   │
   ▼
ALB + ACM certificate (public subnets)
   │
   ▼
Nginx + Node.js backend trên EC2 private subnet
   ├── /        → React static files
   └── /api/*   → Node.js backend trên private container network
                         │
                         ├── TLS 5432, private security group
                         │      → Amazon RDS for PostgreSQL
                         │
                         ├── S3 Gateway VPC Endpoint + IAM instance role
                         │      → S3 private image bucket + KMS
                         │
                         └── Secrets Manager / Parameter Store

Máy quản trị + DBeaver
   └── VPN hoặc SSM port forwarding → RDS private
```

### Default production decisions

- Dùng RDS PostgreSQL thay vì cài PostgreSQL cùng EC2. Đây là lựa chọn chính vì database cần luôn sẵn sàng, có automated backup/PITR và không tranh CPU/RAM/disk với viewer.
- Ở production, đặt backend trong private subnet sau Application Load Balancer. S3 được truy cập qua Gateway VPC Endpoint để traffic không phải đi qua public Internet/NAT.
- Giai đoạn đầu có thể dùng RDS Single-AZ để giảm chi phí; bật Multi-AZ trước khi hệ thống trở thành dịch vụ quan trọng hoặc có yêu cầu uptime chính thức.
- Khởi đầu với storage mã hóa 20–50 GiB và storage autoscaling. Ảnh không nằm trong PostgreSQL nên database nhỏ hơn rất nhiều so với 300–400 GB S3; cần điều chỉnh sau khi import thử và đo tăng trưởng audit.
- Đặt EC2, RDS và S3 cùng AWS Region đã được phê duyệt về nơi lưu trú dữ liệu.
- Dùng một origin HTTPS cho frontend và API để đơn giản hóa cookie, CORS và CSRF.
- Dùng S3 Range GET trên NPY C-contiguous ở phiên bản đầu. Chỉ chuyển sang Zarr/DICOMweb sau benchmark thực tế.
- Password chỉ được lưu dưới dạng Argon2id hoặc scrypt hash có salt và version; không bao giờ lưu mật khẩu gốc, log mật khẩu hoặc gửi password vào S3.

### Budget fallback, not the production default

Nếu chi phí RDS chưa phù hợp cho demo kín, có thể chạy PostgreSQL trong Docker trên cùng EC2 với một encrypted EBS volume riêng. Khi đó bắt buộc:

- Không publish port 5432; chỉ backend container được kết nối qua private Docker network.
- Giới hạn CPU/RAM riêng cho backend và PostgreSQL.
- Backup tự động ra một S3 backup bucket/tài khoản tách quyền xóa khỏi runtime role.
- Có restore drill và monitoring disk/database.
- Chấp nhận single point of failure, downtime khi bảo trì và công việc tự patch/backup/recovery.

Không dùng phương án cùng-server cho dữ liệu thật lâu dài nếu chưa có người chịu trách nhiệm vận hành database.

## Current State Analysis

- `backend/src/data/auth.js` đọc user từ `users.json`, hash bằng scrypt và giữ session trong RAM; restart backend làm mất session.
- `backend/src/data/store.js` đọc/ghi toàn bộ `verifications.json`; chưa có transaction, chống lost update hay lịch sử bất biến.
- `backend/src/data/rawPatients.js` duyệt EHR, lab, metadata và `raw.npy` trực tiếp từ filesystem.
- `backend/src/data/comparison.js` đọc query JSON và Top-K CSV, hiện hardcode đúng 5 query và rank 1–5.
- `backend/src/routes/imaging.js` đọc lát từ NPY cục bộ và trả base64 JSON.
- `frontend/src/api.js` lưu bearer token trong `localStorage`.
- `backend/src/server.js` bật CORS rộng và public `/sample` trước middleware xác thực.
- Viewer trong `frontend/src/components/ScanViewport.jsx` có đổi lát/pan/zoom nhưng chưa có full production flow cho toàn bộ lát từ S3.

## Desired Data Placement

| Loại dữ liệu | Nơi lưu | Ghi chú |
|---|---|---|
| CT/MRI/XQ volume | S3 private | Opaque object key, SSE-KMS, versioning, checksum |
| Patient/encounter metadata | RDS PostgreSQL | ID dùng ở API là UUID opaque |
| EHR text/JSON | RDS PostgreSQL | Mã hóa at rest; cân nhắc application-level encryption cho identifier |
| Lab results | RDS PostgreSQL | Chuẩn hóa thành hàng để query/overlap |
| Retrieval Top-20 | RDS PostgreSQL | Gắn retrieval run/version và source checksum |
| User/account | RDS PostgreSQL | Username + password hash; không lưu plaintext password |
| Session | RDS PostgreSQL | Chỉ lưu hash của opaque token |
| Reviews/history/audit | RDS PostgreSQL | Review event và audit append-only |
| Secrets/KMS keys | Secrets Manager/KMS | Không nằm trong Git, Docker image hoặc database dump |

## Data Model

### Identity and access

- `users`: UUID, normalized username unique, password hash, password algorithm/version, role, active flag, created_by, timestamps.
- `sessions`: UUID, SHA-256 token hash unique, user FK, expiry, revoked_at, IP, user agent, timestamps.
- `login_events`: attempted username hash, success/failure reason, IP, user agent, request ID, timestamp.

Roles tối thiểu:

- `admin`: tạo/khóa tài khoản, phân batch, xem và tải CSV/JSON, xem audit.
- `reviewer`: xem batch được phân công và lưu đánh giá; không được quản trị user hoặc export toàn bộ dữ liệu.

### Clinical catalogue

- `patients`: UUID opaque, encrypted source patient code, keyed-HMAC lookup value, demographics cần thiết.
- `encounters`: UUID, patient FK, encrypted source record code, encounter dates.
- `ehr_documents`: encounter FK, normalized JSONB/text, version và source checksum.
- `lab_results`: encounter FK, test code/name, value, unit, range, abnormal flag, result time.
- `imaging_studies`: encounter FK, modality, encrypted accession/study identifier, study time.
- `imaging_series`: study FK, dtype, shape, slice count, byte order, NPY data offset, slope/intercept, image object FK.
- `image_objects`: UUID, bucket, opaque key, S3 version ID, bytes, checksum và ingest status.

### Retrieval, review and audit

- `retrieval_runs`: UUID, model/version, artifact checksum, created_at.
- `retrieval_pairs`: run FK, query FK, candidate FK, rank constrained 1–20, score, overlap JSONB; unique `(run_id, query_patient_id, rank)`.
- `verification_batches`: run FK, display name, status and timestamps.
- `batch_queries`: batch/query mapping, display order and optional reviewer assignment.
- `reviews`: pair FK, reviewer FK, status, note, version and timestamps.
- `review_events`: append-only before/after values, actor, request ID, timestamp.
- `audit_events`: append-only actor, action, resource UUID/type, minimal metadata, IP, request ID and timestamp.

## What We Are Not Doing

- Không lưu database trên laptop hoặc phụ thuộc laptop bật 24/7.
- Không dùng DBeaver làm database server; DBeaver chỉ là client quản trị.
- Không public RDS port 5432 hoặc cho phép `0.0.0.0/0`.
- Không public S3 bucket, không đặt AWS access key trong frontend và không trả presigned URL cho toàn bộ NPY.
- Không lưu plaintext password, raw session token, patient ID thật trong URL/S3 key/log.
- Không lưu volume ảnh trong PostgreSQL.
- Không làm MPR/3D/DICOMweb đầy đủ trong migration đầu; phạm vi đầu tiên là duyệt toàn bộ lát hiện có, pan, zoom và window/level.
- Không upload 300–400 GB bằng browser console như quy trình production.
- Không đưa dữ liệu thật lên trước khi hoàn thành kiểm thử khử định danh, phân quyền, audit, backup và restore.

## Phase 0: Data Governance and Region Decision

### Changes Required

1. Xác định dữ liệu có còn identifier trực tiếp/gián tiếp hay đã khử định danh.
2. Chốt AWS Region theo quy định nơi lưu trữ dữ liệu và khoảng cách đến người review.
3. Chốt retention cho ảnh, EHR/lab, review, audit và backup.
4. Lập danh sách người được phép xem dữ liệu, người được export và người giữ quyền AWS root/break-glass.
5. Chốt mục tiêu ban đầu: RPO 24 giờ và RTO 4 giờ cho demo; siết chặt trước production thật.

### Success Criteria

#### Automated Verification

- [ ] Scanner/manifest không tìm thấy identifier bị cấm trong S3 object key hoặc tên file import.
- [ ] Infrastructure config dùng duy nhất Region đã được duyệt.

#### Manual Verification

- [ ] Có văn bản xác nhận loại dữ liệu, retention và phạm vi người dùng.
- [ ] Có quyết định ai được giữ quyền admin app, AWS và database.

**Implementation Note**: Không upload dữ liệu thật trước checkpoint này.

## Phase 1: AWS Account, VPC and Server Baseline

### Changes Required

1. Bật MFA cho AWS root, không dùng root cho thao tác thường ngày và tạo IAM admin/operator theo least privilege.
2. Thiết lập AWS Budget/cost alerts trước khi upload hàng trăm GB.
3. Tạo VPC với ít nhất:
   - public subnets ở hai Availability Zones cho Application Load Balancer;
   - private app subnet cho EC2 backend;
   - private DB subnets ở tối thiểu hai Availability Zones cho RDS subnet group.
4. Tạo security groups:
   - `alb-sg`: inbound 443 từ Internet, 80 chỉ để redirect sang HTTPS.
   - `app-sg`: chỉ nhận traffic từ `alb-sg`; không có inbound trực tiếp từ Internet.
   - `db-sg`: inbound PostgreSQL 5432 chỉ từ `app-sg`, không từ IP Internet.
5. Tạo EC2 private với encrypted EBS, Docker, Compose, automatic security updates, Nginx và monitoring agent.
6. Ưu tiên AWS Systems Manager Session Manager thay cho public SSH; nếu vẫn dùng SSH, giới hạn IP và key.
7. Dùng ACM certificate trên ALB và một domain như `verify.example.com`; frontend và API cùng origin.
8. Tạo S3 Gateway VPC Endpoint cho private app subnet; cân nhắc interface endpoints cho Secrets Manager/KMS/CloudWatch nếu muốn bỏ NAT hoàn toàn.

### Success Criteria

#### Automated Verification

- [ ] Public scan chỉ thấy ALB 80/443; EC2 không có public IP/lộ backend port và RDS không lộ 5432.
- [ ] Security group của RDS chỉ nhận source security group của backend.
- [ ] S3 access từ backend đi qua VPC endpoint và vẫn bị IAM/bucket policy giới hạn.
- [ ] EC2 disk được mã hóa và AWS root có MFA.

#### Manual Verification

- [ ] Operator đăng nhập EC2 qua SSM hoặc đường quản trị hạn chế.
- [ ] Budget alert và owner nhận thông báo đã được kiểm thử.

## Phase 2: Managed RDS PostgreSQL Foundation

### Changes Required

1. Tạo RDS PostgreSQL trong private DB subnet group, `Publicly accessible = No`.
2. Bật encryption at rest bằng KMS ngay khi tạo instance; encryption phải bao phủ storage, logs, backups và snapshots.
3. Bật automated backups/PITR với retention ít nhất 7 ngày cho demo, 14–35 ngày khi production; bật deletion protection và snapshot cuối khi xóa.
4. Bắt đầu Single-AZ nếu cần tiết kiệm; chuyển Multi-AZ khi có người dùng thật/uptime requirement.
5. Bật TLS bắt buộc. Backend verify CA/hostname, không dùng `rejectUnauthorized: false`.
6. Lưu master/admin credential trong Secrets Manager. Tạo role tách biệt:
   - migration owner;
   - runtime role chỉ DML cần thiết;
   - read-only/report role nếu cần;
   - backup/audit role theo chính sách.
7. Không dùng master user trong runtime `DATABASE_URL`.
8. Thiết lập maintenance window, minor version upgrade policy, disk/autoscaling alerts, CPU/connections/free storage alerts.
9. Cho DBeaver kết nối qua SSM port forwarding, VPN hoặc bastion private; không đổi RDS thành public chỉ để dùng GUI.
10. Tạo snapshot thủ công trước migration lớn và diễn tập point-in-time restore vào instance staging cô lập.

### Initial sizing approach

- Storage ban đầu 20–50 GiB, encrypted, autoscaling với ngưỡng cảnh báo rõ ràng.
- Chọn instance nhỏ nhất đáp ứng PostgreSQL version và workload staging; đo CPU, memory, active connections, query latency sau import mẫu.
- `pg.Pool` backend khởi đầu 5 connections/process; tổng max connections phải tính theo số backend replicas.
- Chỉ thêm RDS Proxy khi có nhiều replica/serverless connection churn; không thêm vào MVP nếu pool ổn định.

### Success Criteria

#### Automated Verification

- [ ] RDS không có public IP và chỉ backend kết nối được qua TLS.
- [ ] Runtime DB role không tạo/drop/alter schema và không đọc bảng ngoài phạm vi cần thiết.
- [ ] Backup tự động, encryption, deletion protection và alarms đều bật.
- [ ] Restore test đạt RPO/RTO đã chốt.

#### Manual Verification

- [ ] DBeaver kết nối thành công qua tunnel/private path, rồi ngắt tunnel thì không còn truy cập.
- [ ] Operator có thể xác định backup mới nhất và phục hồi vào staging từ runbook.

**Implementation Note**: Dừng để xác nhận private access, TLS và restore trước khi import clinical data.

## Phase 3: Private S3 Foundation

### Changes Required

1. Tạo bucket ảnh production và bucket/prefix backup/audit tách quyền phù hợp.
2. Bật toàn bộ S3 Block Public Access và Bucket owner enforced Object Ownership.
3. Bật versioning, SSE-KMS và S3 Bucket Key; bucket policy deny request không dùng TLS.
4. Gắn IAM instance role cho EC2 backend; không lưu long-lived AWS access key trên server.
5. Runtime role chỉ có `s3:GetObject`, `s3:GetObjectVersion` và KMS decrypt trên prefix ảnh.
6. Ingest role có multipart upload/checksum nhưng runtime role không có put/delete.
7. Dùng opaque key, ví dụ `prod/series/<series_uuid>/volume.npy`.
8. Bật CloudTrail S3 data events theo yêu cầu audit; runtime không được xóa audit/backup.
9. Giữ object đang dùng trong S3 Standard. Chỉ tạo lifecycle sau khi có access metrics; không archive object mà viewer phải đọc tức thời.

### Success Criteria

#### Automated Verification

- [ ] AWS public access checks không phát hiện bucket/object public.
- [ ] Request HTTP/non-TLS bị từ chối.
- [ ] Backend role đọc được đúng prefix nhưng không upload/xóa.
- [ ] Mỗi object test có KMS encryption, checksum và version ID.

#### Manual Verification

- [ ] Không có mã bệnh nhân, record ID hay chẩn đoán trong bucket/key.
- [ ] Quy trình rotate/disable KMS key có owner và cảnh báo rõ ràng.

## Phase 4: PostgreSQL Migrations and Backend Repositories

> Trạng thái 2026-09-12: đã dựng khung config, migration, repository, cookie session,
> transaction review/audit và production Compose. Theo yêu cầu của chủ dự án,
> chưa chạy migration/seed/import trên database triển khai và chưa ghi dữ liệu nào;
> các tiêu chí integration/manual bên dưới vẫn để mở cho lúc có RDS staging.

### New modules

- `backend/src/config.js`: validate DB, S3, cookie, origin và runtime settings khi boot.
- `backend/src/db/pool.js`: `pg.Pool`, TLS, timeouts, health check và graceful shutdown.
- `backend/src/db/migrations/*.sql`: schema/index/constraint versioned.
- `backend/src/repositories/authRepository.js`
- `backend/src/repositories/patientRepository.js`
- `backend/src/repositories/retrievalRepository.js`
- `backend/src/repositories/reviewRepository.js`
- `backend/src/repositories/auditRepository.js`
- `backend/src/storage/s3ImageStore.js`

### Existing modules

1. Thay file persistence trong `backend/src/data/auth.js`, `store.js` và `rawPatients.js` bằng repository async.
2. Chuyển routes/comparison sang `async/await`; giữ overlap logic thuần để unit test.
3. Tạo admin đầu tiên bằng command idempotent chạy thủ công hoặc one-time secret; không tự tạo credential mặc định mỗi lần boot.
4. Review upsert, optimistic version, review event và audit event phải nằm trong cùng transaction.
5. Thay in-memory session bằng opaque session cookie và session hash trong RDS.
6. Thêm liveness không phụ thuộc DB và readiness yêu cầu DB + S3 configuration hợp lệ.

### Success Criteria

#### Automated Verification

- [ ] Migration chạy được trên database rỗng và được test trong staging.
- [ ] Concurrent reviews không mất dữ liệu; stale version trả 409.
- [ ] Plaintext password và raw session token không xuất hiện trong RDS/log.
- [ ] Repository integration tests dùng database test cô lập.
- [ ] DB unavailable làm readiness trả 503 và API clinical fail closed.

#### Manual Verification

- [ ] Admin tạo/khóa reviewer và quyền có hiệu lực ngay.
- [ ] Review history thể hiện đúng actor, giá trị cũ/mới và thời gian.

## Phase 5: Idempotent Import and Top-20

### Changes Required

1. Tạo `backend/scripts/import-clinical-data.js` để parse EHR/lab/meta và upsert theo source checksum.
2. Tạo `backend/scripts/import-retrieval.js` để import CSV thành immutable retrieval run và đúng rank 1–20.
3. Bỏ `QUERY_LIMIT=5` và `CANDIDATE_LIMIT=5`; query được chọn bằng verification batch trong PostgreSQL.
4. Reject retrieval run nếu rank trùng, ngoài 1–20 hoặc thiếu rank khi batch yêu cầu đủ 20.
5. Tạo `backend/scripts/upload-imaging.js`:
   - validate NPY magic/header, dtype, byte order và C-contiguous layout;
   - tính checksum và byte size;
   - cấp UUID opaque cho study/series/object;
   - multipart upload có retry/resume;
   - lưu bucket/key/version/checksum/header fields vào RDS;
   - chỉ chuyển trạng thái `pending → uploaded → verified` sau HEAD/checksum verification.
6. Tạo reconciliation command đối chiếu source manifest, RDS rows và S3 objects.
7. Import thử một query + Top-20 trước; sau đó mới chạy toàn bộ 5 query + 100 pair và toàn bộ ảnh liên quan.
8. Dùng AWS CLI/DataSync hoặc ingest script có resume cho 300–400 GB; không dùng browser upload.

### Success Criteria

#### Automated Verification

- [ ] Chạy import lại không tạo duplicate patient, encounter, series hoặc retrieval pair.
- [ ] Mỗi query active có đúng rank 1–20 theo source CSV.
- [ ] Reconciliation không có missing/mismatched row, byte size hoặc checksum.
- [ ] Multipart upload bị ngắt có thể resume hoặc cleanup an toàn.
- [ ] Không có source patient ID/record ID trong S3 key.

#### Manual Verification

- [ ] Random sample EHR/lab/metadata khớp source.
- [ ] Một query hiển thị đúng Top-20 order và score như CSV.

**Implementation Note**: Chỉ dùng synthetic/de-identified data ở lần chạy đầu.

## Phase 6: Full-Slice S3 Viewer

### Changes Required

1. `backend/src/storage/s3ImageStore.js` dùng AWS SDK v3 và instance role.
2. Với slice `i`, tính byte range từ `data_offset + i * height * width * bytes_per_value`; chỉ `GetObject` đúng range đó.
3. Endpoint dùng opaque ID:

```text
GET /api/imaging/series/:seriesId/slices/:sliceIndex?window=400&level=40
```

4. Backend xác nhận user được gán batch/query/pair trước mọi S3 call.
5. Apply slope/intercept và window/level server-side; trả PNG/WebP binary thay base64 JSON.
6. Giới hạn index, dtype, dimensions, window, level, response size và rate.
7. Audit theo `series-open` và access session đã gom nhóm; không ghi một row cho mỗi lần lăn chuột.
8. Sửa `frontend/src/components/ScanViewport.jsx` để load blob, cancel request cũ, prefetch lát liền kề và giữ pan/zoom/window-level.
9. `slice_count` từ RDS là toàn bộ số lát; không còn giả định demo preview.

### Performance gate

- Target ban đầu: p95 first slice dưới 1.5 giây, adjacent slice dưới 500 ms ở concurrency dự kiến.
- Nếu không đạt, benchmark Zarr chunk 8–16 lát, dedicated image service hoặc DICOMweb/OHIF nếu còn original DICOM.
- Chưa thêm CloudFront cho ảnh y tế trước khi review signed access, cache invalidation và audit behavior.

### Success Criteria

#### Automated Verification

- [ ] First/middle/last slice có byte range và pixel output đúng với local reference.
- [ ] Một slice request không tải nguyên NPY về backend.
- [ ] User không thuộc batch nhận 403 trước khi có S3 request.
- [ ] Input sai trả controlled 4xx, không lộ S3 key/path nội bộ.
- [ ] Load test đạt gate mà không làm cạn DB pool hoặc Node memory.

#### Manual Verification

- [ ] Reviewer cuộn được từ lát đầu đến lát cuối của CT/MRI.
- [ ] Pan, zoom, reset và window/level ổn định trên series lớn đại diện.

## Phase 7: Authentication, Authorization and Export Security

### Changes Required

1. Thay localStorage bearer token bằng opaque cookie `HttpOnly`, `Secure`, `SameSite=Strict`, expiry cố định.
2. Hash password bằng Argon2id hoặc asynchronous parameterized scrypt; có algorithm/version để nâng cấp sau.
3. Rate-limit login, progressive delay/temporary lockout; MFA bắt buộc cho admin trước dữ liệu thật.
4. Thêm CSRF/Origin validation cho request thay đổi dữ liệu.
5. Áp dụng authorization theo role và batch assignment ở backend, không chỉ ẩn nút frontend.
6. Chỉ admin được tạo/khóa user, xem export toàn cục và tải CSV/JSON.
7. Escape CSV formula cho cell bắt đầu bằng `=`, `+`, `-`, `@`.
8. Thêm Helmet, body/note limits, explicit same-origin policy, request ID và sanitized errors.
9. Xóa public `/sample` production route và legacy synthetic patient API.
10. Audit login, patient/encounter open, series open, review edit, user admin và export.

### Success Criteria

#### Automated Verification

- [ ] Browser JavaScript không đọc được session cookie.
- [ ] CSRF, IDOR, role bypass và brute-force tests pass.
- [ ] Reviewer gọi trực tiếp API create-user/export vẫn nhận 403.
- [ ] Disable user thu hồi mọi active session.
- [ ] Production không còn public `/sample` và CSV không chạy formula injection.

#### Manual Verification

- [ ] Admin MFA enrollment/recovery được thử nghiệm.
- [ ] Audit có thể trả lời ai đã xem, sửa hoặc export dữ liệu nào và khi nào.

## Phase 8: Deployment, Observability and Recovery

### Changes Required

1. Tạo production Compose/systemd manifest với pinned images, non-root user, read-only filesystem khi phù hợp, health checks, limits và graceful shutdown.
2. ALB dùng ACM để terminate TLS; Nginx/backend port chỉ ở private network và chỉ nhận traffic từ ALB.
3. Secrets nằm trong Secrets Manager/SSM, không commit `.env`; EC2 role được quyền đọc đúng secret cần thiết.
4. Structured logging phải redact cookie, auth header, password, patient code, EHR, note và S3 signed data.
5. Monitor API p95/error, auth anomaly, RDS CPU/memory/connections/free storage/replication, S3/KMS errors và EC2 disk/memory.
6. Automated RDS backup/PITR là lớp chính; thêm scheduled logical `pg_dump -Fc` mã hóa vào backup bucket nếu chính sách yêu cầu export độc lập.
7. Runtime credentials không được xóa backup; bật snapshot trước migration và quarterly restore drill.
8. Nếu dùng Single-AZ, ghi rõ maintenance/downtime expectation; kích hoạt Multi-AZ khi SLA hoặc real clinical use yêu cầu.
9. Có runbook cho deploy, rollback app, migration rollback/forward-fix, restore DB, S3 object version recovery, credential rotation và incident response.

### Success Criteria

#### Automated Verification

- [ ] Build reproducible; vulnerability scan không còn critical/high chưa xử lý.
- [ ] Secret/PHI không có trong Git history, image layer hoặc logs.
- [ ] Alert hoạt động khi RDS/S3/KMS/readiness lỗi hoặc storage gần đầy.
- [ ] Backup/snapshot tồn tại đúng retention và restore test pass.

#### Manual Verification

- [ ] Từ runbook có thể dựng app server mới và nối vào RDS/S3 hiện hữu.
- [ ] Restore drill đáp ứng RPO/RTO.
- [ ] Operator xử lý được revoke user, rotate secret và rollback release.

## Phase 9: Staging, Security Review and Cutover

### Changes Required

1. Dựng staging tách production bằng database, bucket/prefix, IAM role và secrets riêng.
2. Chạy unit, PostgreSQL integration, API authorization, S3 Range, browser E2E, load và failure-injection tests.
3. Test DB unavailable, S3 denied, KMS denied, expired/revoked session, partial upload và malformed NPY.
4. Security review dữ liệu, network, encryption, auth, audit, logs, backup và export trước khi dùng real data.
5. Freeze artifact version, final import/reconciliation, pre-cutover RDS snapshot rồi mới đổi DNS.
6. Old system chỉ read-only trong rollback window; không cho ghi review song song vào hai nơi.

### Success Criteria

#### Automated Verification

- [ ] Top-20, RBAC, DB, S3, viewer và E2E suites pass ở staging.
- [ ] Reconciliation có zero missing/mismatched objects hoặc rows.
- [ ] Failure injection fail closed và không lộ cached clinical data.
- [ ] Viewer đạt performance gate ở concurrency mục tiêu.

#### Manual Verification

- [ ] Bác sĩ chấp nhận Top-20 order, layout so sánh và full-slice viewer.
- [ ] Security owner phê duyệt trước real data.
- [ ] Restore và rollback runbook được một người khác implementer thực hành thành công.

## Recommended Execution Order

Thứ tự nên làm từ bây giờ:

1. Chốt AWS Region, domain, mức khử định danh và retention.
2. Tạo AWS baseline: IAM/MFA, Budget, VPC, EC2, private subnets/security groups.
3. Tạo private RDS PostgreSQL, bật encryption/backups và kiểm thử DBeaver qua tunnel.
4. Tạo private S3/KMS/IAM roles và upload một volume test.
5. Viết migrations/repositories, chuyển auth/session/review sang RDS.
6. Import một query + Top-20 + một vài series, hoàn thiện full-slice viewer và đo performance.
7. Hoàn thiện RBAC/admin-only export/audit/security.
8. Chạy staging, restore/load/security tests.
9. Upload/import toàn bộ 300–400 GB bằng resumable pipeline, reconciliation rồi cutover.

Không nên upload 300–400 GB trước khi schema, object-key convention, checksum/reconciliation và viewer Range GET đã pass với dataset nhỏ; nếu thiết kế phải đổi, re-upload sẽ tốn thời gian và chi phí.

## Testing Strategy

### Unit tests

- Top-20 rank validation và overlap calculations.
- NPY header/dtype/offset/range/window-level conversion.
- Password/session hashing, expiry và authorization policies.
- CSV/JSON export scope và CSV formula escaping.

### Integration tests

- Repository transaction trên RDS/PostgreSQL test database.
- Review + review event + audit atomicity và optimistic concurrency.
- S3 adapter trên test bucket, gồm Range GET và KMS/IAM denial.
- Import idempotency và source/RDS/S3 reconciliation.
- Cookie/CSRF/RBAC/readiness behavior.

### End-to-end scenarios

- Admin login/MFA, tạo/khóa reviewer, export và xem audit.
- Reviewer chỉ mở assigned batch, thấy đúng Top-20 và không export được.
- Full CT/MRI slice scroll, prefetch/cancel, window-level, pan/zoom.
- RDS/S3/KMS failure và recovery không làm lộ dữ liệu hoặc mất review.

## References

- AWS RDS public/private access: https://docs.aws.amazon.com/AmazonRDS/latest/gettingstartedguide/security-public-private.html
- AWS RDS in a VPC: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_VPC.WorkingWithRDSInstanceinaVPC.html
- AWS RDS infrastructure security/TLS: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/infrastructure-security.html
- AWS RDS encryption: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.Encryption.html
- AWS RDS automated backups and PITR: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html
- AWS RDS Multi-AZ: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html
- AWS Systems Manager port forwarding: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-sessions-start.html
- AWS S3 security best practices: https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html
- AWS S3 Block Public Access: https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html
- AWS SSE-KMS: https://docs.aws.amazon.com/AmazonS3/latest/userguide/specifying-kms-encryption.html
- AWS S3 Bucket Keys: https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-key.html
- AWS CloudTrail S3 data events: https://docs.aws.amazon.com/AmazonS3/latest/userguide/cloudtrail-logging-s3-info.html
- AWS IAM temporary credentials: https://docs.aws.amazon.com/IAM/latest/UserGuide/security-creds-programmatic-access.html
- PostgreSQL password authentication: https://www.postgresql.org/docs/current/auth-password.html
- node-postgres pooling: https://node-postgres.com/features/pooling
