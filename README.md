# Hệ thống xác minh bệnh nhân tương tự

## Triển khai cloud một lệnh

Nhánh này dùng PostgreSQL cho tài khoản, session, metadata, retrieval và review;
ảnh được định danh trong PostgreSQL và đọc từ S3 private. Production Compose
không mount dữ liệu từ `/mnt` hoặc `sample_data`.

Trên server đã cài Docker Engine và Docker Compose v2:

```bash
cp .env.production.example .env.production
# Điền DATABASE_URL, RDS CA, AWS Region/S3 bucket, domain và admin bootstrap.
chmod 600 .env.production
./deploy.sh
```

Script sẽ kiểm tra cấu hình, build hai image, chạy migration, tạo admin ban đầu
theo cách idempotent, khởi động dịch vụ và chờ readiness. Backend chỉ được expose
trong Docker network; frontend mặc định lắng nghe cổng `8080` để đặt sau ALB hoặc
reverse proxy HTTPS.

Yêu cầu trước khi chạy:

- RDS/PostgreSQL đã tồn tại và server kết nối được tới cổng 5432.
- File CA của RDS tồn tại tại `RDS_CA_CERT_FILE` và user trong container có quyền đọc.
- EC2/server có IAM role đọc đúng S3 bucket private. Không đưa AWS access key vào frontend.
- `ALLOWED_ORIGIN` là origin public chính xác, ví dụ `https://verify.example.com`.
- Nếu chỉ smoke-test bằng HTTP/IP, đặt `SESSION_COOKIE_SECURE=false`; production HTTPS phải để `true`.

Lệnh vận hành:

```bash
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs -f backend frontend
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production down
```

Không dùng `down -v` nếu có volume cần giữ. Import metadata/retrieval và upload ảnh
S3 là bước riêng; script deploy không tự ý import dữ liệu bệnh nhân.

Ứng dụng web hỗ trợ bác sĩ đối chiếu một **bệnh nhân truy vấn** với lần lượt 20 **bệnh nhân tương tự** do hệ thống truy hồi trả về. Dự án gồm frontend React + Vite và backend Node.js/Express, đóng gói bằng Docker.

> Bản cloud đọc tài khoản, metadata, Top-20 và kết quả review từ PostgreSQL.
> Ảnh được giữ trong S3 private; trình duyệt chỉ nhận lát ảnh đã window/resize
> thông qua API đã xác thực.

⚠️ Không dùng trực tiếp cho dữ liệu bệnh nhân thật nếu chưa có xác thực, phân quyền, audit log, mã hóa và đánh giá tuân thủ quy định y tế.

## Mục tiêu

Bác sĩ nhận một file JSON gồm một bệnh nhân query và tối đa 20 bệnh nhân tương tự. Với từng kết quả, bác sĩ so sánh hai hồ sơ theo cùng một loại dữ liệu tại một thời điểm, sau đó ghi nhận kết luận.

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
- Hiển thị bệnh nhân query và 20 kết quả theo `rank`.
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

Với mỗi cặp query–similar patient, bác sĩ có thể chọn:

- `Xác nhận tương tự`
- `Không tương tự`
- `Cần xem lại`

Kết quả lưu kèm ghi chú, người review, thời điểm, `query_patient_id`, `similar_patient_id`, `rank` và `similarity_score` để truy vết.

## Kiến trúc dữ liệu cloud

- PostgreSQL lưu tài khoản, session, metadata bệnh nhân, encounter, EHR, lab,
  study/series ảnh, Top-20, batch phân công, kết quả review và audit log.
- S3 private lưu object ảnh. Bảng `image_objects` chỉ giữ bucket/key, kiểu dữ
  liệu, shape và offset cần thiết để backend đọc đúng byte range của một lát.
- Backend dùng IAM role của server để đọc S3; không lưu access key trong source
  code và không phát URL object công khai.
- Frontend không kết nối trực tiếp PostgreSQL hoặc S3 và không nhận toàn bộ file
  thể tích. Endpoint ảnh trả về một lát đã window/resize sau khi kiểm tra quyền.
- Dữ liệu nguồn không được mount vào container. Pipeline import PostgreSQL và
  upload S3 là công việc riêng, không nằm trong `deploy.sh`.

## Cấu trúc dự án

```
patient-verify-app/
├── docker-compose.yml
├── deploy.sh                  # Kiểm tra cấu hình và triển khai một lệnh
├── .env.production.example   # Danh sách biến môi trường, không chứa secret
├── backend/                   # Express API, PostgreSQL và S3 adapter
└── frontend/                  # React UI + Nginx reverse proxy /api
```

## API chính

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| POST | `/api/auth/login` | Công khai | Đăng nhập và tạo session cookie |
| GET | `/api/auth/me` | Đã đăng nhập | Lấy người dùng hiện tại |
| POST | `/api/auth/logout` | Đã đăng nhập | Kết thúc session |
| GET/POST | `/api/auth/users` | Admin | Danh sách/tạo tài khoản |
| GET | `/api/comparison/queries` | Đã đăng nhập | Query được phân công |
| GET | `/api/comparison` | Đã đăng nhập | Query và Top-20 |
| GET | `/api/comparison/:patientId` | Đã đăng nhập | Chi tiết một cặp so sánh |
| POST | `/api/comparison/:patientId/verify` | Đã đăng nhập | Lưu đánh giá có kiểm soát version |
| GET | `/api/comparison/export` | Admin | Tải CSV/JSON |
| GET | `/api/imaging/series/:seriesId/slices` | Đã đăng nhập | Đọc một lát ảnh được phép |
| GET | `/api/health/live` | Công khai | Liveness |
| GET | `/api/health/ready` | Công khai | Readiness gồm kết nối database |

`status` hợp lệ: `pending` \| `very_similar` \| `similar` \| `uncertain` \| `dissimilar` \| `very_dissimilar`

### Quyền và kết quả đánh giá

- Chỉ admin nhìn thấy chức năng tạo tài khoản và tải kết quả CSV/JSON.
- Reviewer chỉ nhìn thấy batch/query được phân công trong PostgreSQL.
- Mỗi query phải có đúng 20 dòng retrieval đang hoạt động; backend từ chối
  session Top-20 thiếu hoặc dư để tránh review sai tập.
- Mỗi kết quả được bác sĩ đánh giá ở một trong năm mức: `very_similar`, `similar`, `uncertain`, `dissimilar`, `very_dissimilar`.
- Kết quả lưu rank, retrieval score, mức đánh giá, ghi chú, reviewer, thời điểm
  và version. Các thao tác quản trị/xuất file được ghi audit.
