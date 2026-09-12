# Hệ thống xác minh bệnh nhân tương tự

Ứng dụng web hỗ trợ bác sĩ đối chiếu các **bệnh nhân truy vấn**, mỗi bệnh nhân với đúng 20 **bệnh nhân tương tự** của một retrieval run. Dự án gồm frontend React + Vite, backend Node.js/Express, PostgreSQL và khung lưu ảnh private trên Amazon S3.

> Repository hiện mới dựng khung cloud/RDS/S3. Chưa có lệnh nào tự động import
> dữ liệu bệnh nhân, upload S3 hoặc seed tài khoản khi backend khởi động.

⚠️ Không dùng trực tiếp cho dữ liệu bệnh nhân thật nếu chưa có xác thực, phân quyền, audit log, mã hóa và đánh giá tuân thủ quy định y tế.

## Mục tiêu

Bác sĩ đăng nhập để chọn query trong batch được phân quyền và đối chiếu lần lượt Top-20. Với từng kết quả, bác sĩ so sánh hai hồ sơ theo cùng một loại dữ liệu tại một thời điểm, sau đó ghi nhận kết luận.

Ví dụ dữ liệu đầu vào:

```json
{
  "patient_id": "24147912",
  "similar_patients": [
    { "rank": 1, "patient_id": "23194466", "similarity_score": 0.9123 },
    { "rank": 2, "patient_id": "23180221", "similarity_score": 0.9087 }
  ]
}
```

`patient_id` là bệnh nhân query. `similar_patients` được giữ theo thứ hạng (`rank`) và điểm tương đồng gốc (`similarity_score`).

## Thiết kế giao diện

Giao diện có sidebar danh sách 20 kết quả và hai panel đối chiếu cố định:

```text
Sidebar: Query + danh sách #1 ... #20

┌────────────── Bệnh nhân query ──────────────┬────────── Bệnh nhân tương tự #n ──────────┐
│ Mã BN, thông tin cơ bản, chọn bệnh án        │ Rank, similarity score, chọn bệnh án        │
├─────────────────────────────────────────────┴─────────────────────────────────────────────┤
│                         [ EHR ] [ Lab result ] [ XQ ] [ CT ] [ MRI ]                       │
├─────────────────────────────────────────────┬─────────────────────────────────────────────┤
│ Nội dung của mục đang chọn (query)          │ Nội dung cùng mục (bệnh nhân tương tự)      │
└─────────────────────────────────────────────┴─────────────────────────────────────────────┘
                 [ Không tương tự ] [ Cần xem lại ] [ Xác nhận tương tự ]
```

### Sidebar và thứ hạng

- Có thể tìm/chọn một query trong danh sách được cấu hình để verify.
- Hiển thị bệnh nhân query và đúng 20 kết quả theo `rank` của retrieval run trong PostgreSQL.
- Mỗi kết quả có mã bệnh nhân, điểm tương đồng dạng phần trăm và trạng thái review.
- Bác sĩ chọn một kết quả để mở ở panel bên phải; panel query bên trái luôn giữ bệnh nhân query.
- Có ô tìm kiếm theo mã bệnh nhân và bộ đếm số kết quả đã xử lý.

### Điểm giống quan sát được

- Header đối chiếu hiển thị nhóm primary ICD chung lấy trực tiếp từ artifact
  retrieval, từ khóa EHR chung, xét nghiệm chung/bất thường chung và modality
  ảnh mà cả hai bệnh nhân đều có.
- Từ khóa EHR chung được highlight màu vàng trong cả hai panel. Xét nghiệm
  xuất hiện ở cả hai bệnh nhân được highlight theo hàng.
- Các highlight là overlap có thể kiểm chứng từ raw data; chúng không được mô
  tả là lời giải thích nhân quả cho cosine similarity của model.

### Chọn bệnh án

Một bệnh nhân có thể có nhiều bệnh án/mốc dữ liệu. Mỗi panel có bộ chọn bệnh án riêng:

- Chỉ một bệnh án được hiển thị cho mỗi bệnh nhân tại một thời điểm.
- Bác sĩ có thể chọn bệnh án query và bệnh án tương tự độc lập.
- Khi đổi mục dữ liệu, lựa chọn bệnh án và series trước đó được giữ lại nếu vẫn hợp lệ.
- Nếu không có bệnh án hoặc loại dữ liệu cần xem, panel giữ đúng vị trí và hiển thị `Không có dữ liệu`.

### Chọn loại dữ liệu

Chỉ **một** loại dữ liệu được hiển thị trên cả hai panel tại một thời điểm. Các mục dùng chung một thanh điều hướng:

| Mục | Nội dung hiển thị sau khi bấm |
|---|---|
| EHR | Chỉ hồ sơ bệnh án dạng text/có cấu trúc của bệnh án đang chọn. |
| Lab result | Chỉ bảng xét nghiệm: chỉ số, giá trị, đơn vị, khoảng tham chiếu và cờ bất thường. |
| XQ | Danh sách study XQ; sau khi chọn study sẽ hiện đúng hai ảnh preview XQ. |
| CT | Danh sách bệnh án/study/series CT; sau khi chọn series sẽ hiện viewer tương ứng. |
| MRI | Danh sách bệnh án/study/series MRI; sau khi chọn series sẽ hiện viewer tương ứng. |

Không hiển thị đồng thời EHR, lab và hình ảnh; bác sĩ chủ động chuyển mục cần so sánh.

### Hình ảnh y khoa

- **XQ:** mỗi study được chọn hiển thị hai ảnh preview; hỗ trợ phóng to để xem chi tiết.
- **CT/MRI:** chọn từng study và series độc lập cho bên query và bên tương tự.
- Viewer hỗ trợ pan, zoom, đổi lát cắt và điều chỉnh window/level bằng thao tác chuột.
- Viewer thể tích 3D cho CT/MRI hỗ trợ xoay, kéo, pan, zoom và reset góc nhìn. Có thể bổ sung chế độ đồng bộ thao tác hai bên khi so sánh cùng modality.
- Trình duyệt không tải trực tiếp các file `raw.npy` lớn. Backend sẽ cung cấp slice/preview và dữ liệu đã được tiền xử lý phù hợp cho viewer.

### Căn chỉnh khi đối chiếu

Hai panel dùng cùng chiều rộng, cấu trúc header và vùng nội dung tương ứng. Khi một bên thiếu dữ liệu, khu vực đó vẫn được giữ để hai bên không bị lệch hàng. Nội dung dài cuộn trong vùng riêng thay vì làm thay đổi bố cục panel còn lại.

### Kết quả xác minh

Với mỗi cặp query–similar patient, bác sĩ có thể chọn một trong năm mức:

- `Rất tương tự`
- `Tương tự`
- `Chưa rõ`
- `Khác biệt`
- `Rất khác`

Kết quả lưu kèm ghi chú, người review, thời điểm, `query_patient_id`, `similar_patient_id`, `rank` và `similarity_score` để truy vết.

## Đăng nhập và phân quyền

- Mọi API chứa dữ liệu bệnh nhân đều yêu cầu session cookie opaque `HttpOnly`.
- Tài khoản `reviewer` có thể xem hồ sơ và lưu đánh giá.
- Chỉ tài khoản `admin` thấy khu vực **Quản lý tài khoản**, được tạo tài khoản mới và được xem/tải kết quả CSV hoặc JSON. Backend vẫn kiểm tra quyền admin nếu gọi endpoint trực tiếp.
- Tài khoản, password hash `scrypt-v1`, session token hash, đánh giá và audit nằm trong PostgreSQL. Raw password và raw session token không được lưu trong database.

## Dữ liệu nguồn dự kiến

Mỗi bệnh nhân được đọc từ thư mục dữ liệu raw, theo mẫu trong `sample_data`:

```text
<patient_id>/
└── <record_id>/
    ├── EHR/text.json
    ├── lab_result/lab.json
    ├── XQ/<study>/.../meta.json + raw.npy
    ├── CT/<study>/<series>/meta.json + raw.npy
    └── MRI/<study>/<series>/meta.json + raw.npy
```

- Cấu trúc trên là nguồn cho import command ở phase tiếp theo; production API không duyệt filesystem raw.
- Metadata/EHR/lab/retrieval được import vào PostgreSQL; NPY được upload vào S3 bằng pipeline riêng có checksum/reconciliation.
- Endpoint ảnh chỉ được phép trả một lát đã window/resize sau khi kiểm tra quyền; trình duyệt không nhận file `raw.npy`.

## Cấu trúc dự án

```
patient-verify-app/
├── docker-compose.yml
├── sample_data/ # Dữ liệu tham chiếu cục bộ, không tự import và không commit vào Git
├── backend/     # Express API, migrations và PostgreSQL repositories
└── frontend/    # React UI hai panel đối chiếu
```

## Trạng thái khung cloud

- `backend/src/config.js`: kiểm tra cấu hình RDS, TLS, cookie, origin và S3 khi backend boot.
- `backend/src/db/migrations/001_initial.sql`: schema identity, clinical catalogue, Top-20, review history và audit.
- `backend/src/repositories/`: lớp truy cập PostgreSQL async và transaction.
- `backend/src/storage/s3ImageStore.js`: IAM-based S3 Range GET primitive; chưa có thao tác upload/import tự động.
- `backend/scripts/migrate.js`: migration thủ công, idempotent.
- `backend/scripts/seed-admin.js`: tạo admin đầu tiên bằng lệnh thủ công, không chạy lúc server boot.
- `/api/imaging/series/:seriesId/slices` hiện là placeholder 503 cho tới khi phase full-slice viewer hoàn tất.

Không có script nào được chạy tự động lên RDS/S3 production từ repository này.

## Khởi tạo môi trường local bằng Docker

- Frontend: http://localhost:5174
- Backend API: http://localhost:4001/api (hoặc cùng-origin `/api` qua frontend tại http://localhost:5174)
Docker Compose local không tự import clinical data. Khi chủ động muốn tạo database phát triển, chạy từng bước:

```bash
cp .env.example .env
docker compose up -d postgres
docker compose --profile setup run --rm migrate
docker compose run --rm backend npm run seed:admin
docker compose up --build backend frontend
```

Chỉ lệnh `seed:admin` đọc `ADMIN_USERNAME`/`ADMIN_PASSWORD`; backend không tự tạo credential. Không commit mật khẩu thật vào repository.

Dừng: `docker compose down`
Việc xóa database/volume phải được thực hiện thủ công và không nằm trong lệnh khởi động thông thường.

## Chạy không dùng Docker (phát triển local)

Backend:
```bash
cd backend
npm install
DATABASE_URL='postgresql://app_user:password@localhost:5432/patient_verify' \
DB_SSL_MODE=disable ALLOWED_ORIGIN=http://localhost:5173 npm run dev
# http://localhost:4000 (hoặc thêm PORT=4001 nếu port 4000 đang bận)
```

Frontend (terminal khác):
```bash
cd frontend
npm install
VITE_API_URL=http://localhost:4001/api npm run dev
```

## API hiện có

| Method | Path                        | Mô tả                                  |
|--------|------------------------------|-----------------------------------------|
| GET    | /api/health/live               | Liveness của Node.js                     |
| GET    | /api/health/ready              | Readiness yêu cầu PostgreSQL              |
| POST   | /api/auth/login               | Đăng nhập và nhận HttpOnly session cookie |
| GET    | /api/auth/me                  | Đọc tài khoản đang đăng nhập            |
| POST   | /api/auth/logout              | Đăng xuất                               |
| GET    | /api/auth/users               | Danh sách tài khoản (chỉ admin)         |
| POST   | /api/auth/users               | Tạo tài khoản (chỉ admin)               |
| GET    | /api/comparison/queries        | Query thuộc batch được phân quyền       |
| GET    | /api/comparison                | Query và đúng Top-20                     |
| GET    | /api/comparison/:candidateId   | Hồ sơ ứng viên bằng opaque UUID          |
| POST   | /api/comparison/:candidateId/verify | Lưu review có optimistic version    |
| GET    | /api/comparison/export         | Tải CSV/JSON kết quả (chỉ admin)        |

`status` hợp lệ: `pending` \| `very_similar` \| `similar` \| `uncertain` \| `dissimilar` \| `very_dissimilar`

### Top-20 và xuất đánh giá

- Query và Top-20 sẽ được tạo bởi import pipeline trong PostgreSQL; API từ chối query chưa đủ liên tục rank 1–20.
- Mỗi kết quả được bác sĩ đánh giá ở một trong năm mức: `very_similar`, `similar`, `uncertain`, `dissimilar`, `very_dissimilar`.
- Hai nút **CSV** và **JSON** chỉ hiển thị cho admin và tải toàn bộ 20 kết quả hiện tại, gồm rank, retrieval score, mức đánh giá, ghi chú, người review và thời điểm.
