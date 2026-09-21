# Hệ thống xác minh bệnh nhân tương tự

Ứng dụng web hỗ trợ bác sĩ đối chiếu một **bệnh nhân truy vấn** với lần lượt 20 **bệnh nhân tương tự** do hệ thống truy hồi trả về. Dự án gồm frontend React + Vite và backend Node.js/Express, đóng gói bằng Docker.

> Bản demo đọc trực tiếp dữ liệu raw ở chế độ chỉ đọc. Backend đọc rank và
> cosine similarity từ artifact Top-20; `backend/src/data/retrieval.json`
> chọn chính xác các query sẽ được verify trong phiên hiện tại.

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
     [ 9 tiêu chí, mỗi tiêu chí 1–5 ] [ Mức độ tương tự chung 1–5 ]
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

Với mỗi cặp query–similar patient, bác sĩ chấm từ 1 đến 5 cho 9 tiêu chí:

- Triệu chứng, Chẩn đoán, Thuốc
- Ảnh CT, Ảnh XQ, Ảnh MRI
- Diễn biến lâm sàng, Mức độ nghiêm trọng, Kết quả xét nghiệm

Sau cùng, bác sĩ chấm `Mức độ tương tự chung` từ 1 đến 5. Điểm do người
đánh giá chọn độc lập với cosine similarity của model.

Kết quả lưu kèm ghi chú, người review, thời điểm, `query_patient_id`, `similar_patient_id`, `rank` và `similarity_score` để truy vết.

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

- Khi phát triển UI, dùng `sample_data` và các PNG preview đi kèm.
- Khi triển khai dữ liệu thật, backend dùng path `/mnt/disk4/namtn/similar_case_retrieval/working/our_method/data/raw` qua Docker volume chỉ đọc.
- Dữ liệu verification được lưu tách biệt với dữ liệu raw.
- Endpoint ảnh chỉ trả về một lát đã window/resize; trình duyệt không nhận file `raw.npy`.

## Cấu trúc dự án

```
patient-verify-app/
├── docker-compose.yml
├── sample_data/ # Ví dụ cấu trúc dữ liệu và ảnh preview của một bệnh nhân
├── backend/     # Express API, lớp đọc dữ liệu và lưu kết quả verification
└── frontend/    # React UI hai panel đối chiếu
```

## Chạy bằng Docker (khuyến nghị)

```bash
cp .env.example .env
# Đổi ADMIN_PASSWORD trong .env trước khi chạy.
docker compose up --build
```

- Frontend: http://localhost:5174
- Backend API: http://localhost:4001/api (hoặc cùng-origin `/api` qua frontend tại http://localhost:5174)
- 10 query được chọn trong `backend/src/data/retrieval.json`; Top-20 và điểm retrieval của từng query đọc từ CSV production.
- Tài khoản admin đầu tiên lấy từ `ADMIN_USERNAME` và `ADMIN_PASSWORD` trong
  `.env`; mật khẩu phải có ít nhất 12 ký tự. Các tài khoản tạo sau đó được lưu
  dạng hash trong volume `backend_data`.
- Sau khi đăng nhập, người dùng vào cổng tiện ích trước rồi chọn **Xác minh
  bệnh nhân**. Có thể quay lại trang chính mà không cần đăng nhập lại.
- Trang chính cũng có tiện ích **Xác minh retrieval LLM**. Khu vực **Quản lý
  tài khoản** nằm tại trang chính và chỉ xuất hiện với admin.
- Docker mặc định mount Top-20 production tại
  `/mnt/disk4/similar_cases_retrieval/data/experiments/patient_fusion/top20_attention_pool_all_patients_v1/top20_related_patients.csv`.
  Có thể override host path bằng biến `TOPK_HOST_FILE`.

Dừng: `docker compose down`
Xóa cả dữ liệu đã lưu (verifications): `docker compose down -v`

## Chạy không dùng Docker (phát triển local)

Backend:
```bash
cd backend
npm install
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD='thay-bang-mat-khau-manh-it-nhat-12-ky-tu'
npm run dev      # http://localhost:4000 (hoặc PORT=4001 npm run dev nếu port 4000 đang bận)
```

Frontend (terminal khác):
```bash
cd frontend
npm install
VITE_API_URL=http://localhost:4001/api npm run dev
```

## Xác minh retrieval LLM

Tiện ích này đọc các response Gemini có dạng `calls/<request_id>.json`. Backend
parse JSON nằm trong `response.candidates[].content.parts[].text`, đồng thời
đọc `request_body.json` ở thư mục run để hiển thị context lâm sàng tương ứng
với query và từng candidate. File nguồn chỉ được đọc; kết quả review được lưu
riêng trong `DATA_DIR/llm-retrieval-verifications.json`.

Khi chạy backend trực tiếp:

```bash
export LLM_RETRIEVAL_ROOT=/duong/dan/toi/full_call_P01262_100_top10
npm run dev
```

`LLM_RETRIEVAL_ROOT` có thể trỏ vào một file call, một thư mục run, hoặc thư
mục cha chứa nhiều run. Backend tìm các file JSON bên trong thư mục `calls`.

Khi chạy Docker, tạo `docker-compose.override.yml` trên server:

```yaml
services:
  backend:
    environment:
      LLM_RETRIEVAL_ROOT: /app/llm_retrieval
    volumes:
      - /duong/dan/tren/server/toi/genai_ranking:/app/llm_retrieval:ro
```

Mỗi candidate được chấm mức phù hợp retrieval từ 1–5 và đánh giá riêng độ
chính xác của nhận xét điểm giống, điểm khác và ICD. Chỉ admin được tải toàn
bộ kết quả LLM dưới dạng CSV hoặc JSON.

## API hiện có

| Method | Path                        | Mô tả                                  |
|--------|------------------------------|-----------------------------------------|
| GET    | /api/patients                 | Danh sách rút gọn (cho sidebar)         |
| GET    | /api/patients/:id              | Chi tiết đầy đủ 1 bệnh nhân             |
| POST   | /api/patients/:id/verify       | Gửi kết quả xác minh `{status, note}`   |
| POST   | /api/auth/login                 | Đăng nhập                               |
| GET    | /api/auth/me                    | Kiểm tra phiên hiện tại                 |
| POST   | /api/auth/logout                | Đăng xuất                               |
| GET/POST | /api/auth/users              | Liệt kê/tạo tài khoản (chỉ admin)       |
| GET    | /api/comparison                  | Phiên đối chiếu query và Top-20          |
| POST   | /api/comparison/:id/verify       | Lưu 9 điểm tiêu chí và điểm chung        |
| GET    | /api/comparison/export           | Tải CSV/JSON (chỉ admin)                 |
| GET    | /api/llm-retrieval               | Danh sách LLM call                       |
| GET    | /api/llm-retrieval/:requestId    | Chi tiết ranking và context              |
| POST   | /api/llm-retrieval/:requestId/candidates/:id/verify | Lưu đánh giá LLM |
| GET    | /api/llm-retrieval/export        | Tải đánh giá LLM (chỉ admin)             |

Payload mới của endpoint đối chiếu gồm `criteria_scores`,
`overall_similarity` và `note`. Mọi điểm phải là số nguyên từ 1 đến 5.

### Cập nhật danh sách retrieval và xuất đánh giá

- Sửa mảng `query_patient_ids` trong `backend/src/data/retrieval.json`. Mỗi ID phải có trong Top-K CSV và có raw data; web sẽ hiển thị đúng các query này theo thứ tự trong JSON. Với Docker đang chạy, chỉ cần lưu file và refresh web để nạp lại danh sách.
- Mỗi kết quả được bác sĩ chấm 9 tiêu chí và một điểm tương tự chung từ 1 đến 5.
- Chỉ admin nhìn thấy và sử dụng được hai nút **CSV** và **JSON**. File tải về
  gồm rank, retrieval score, toàn bộ điểm đánh giá, ghi chú, người review và thời điểm.
- Chỉ admin có quyền tạo thêm tài khoản `reviewer` hoặc `admin`.
