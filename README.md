# Hệ thống xác minh bệnh nhân tương tự

Ứng dụng web hỗ trợ bác sĩ đối chiếu 5 **bệnh nhân truy vấn**, mỗi bệnh nhân với 5 **bệnh nhân tương tự** đứng đầu trong CSV Top-20. Dự án gồm frontend React + Vite và backend Node.js/Express, đóng gói bằng Docker.

> Bản demo đọc trực tiếp dữ liệu raw ở chế độ chỉ đọc. Backend đọc rank và
> cosine similarity từ artifact CSV Top-20; `backend/src/data/retrieval.json`
> chọn chính xác 5 query sẽ được verify trong phiên hiện tại. Backend chỉ lấy
> các dòng rank 1–5 và không dùng retrieval JSON dự phòng.

⚠️ Không dùng trực tiếp cho dữ liệu bệnh nhân thật nếu chưa có xác thực, phân quyền, audit log, mã hóa và đánh giá tuân thủ quy định y tế.

## Mục tiêu

Bác sĩ đăng nhập để chọn một trong 5 bệnh nhân query và đối chiếu tối đa 5 bệnh nhân tương tự. Với từng kết quả, bác sĩ so sánh hai hồ sơ theo cùng một loại dữ liệu tại một thời điểm, sau đó ghi nhận kết luận.

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

Giao diện có sidebar danh sách 5 kết quả và hai panel đối chiếu cố định:

```text
Sidebar: Query + danh sách #1 ... #5

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
- Hiển thị bệnh nhân query và 5 kết quả đầu theo `rank` lấy từ CSV.
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

Với mỗi cặp query–similar patient, bác sĩ chấm từ **1 đến 5** cho từng tiêu chí,
theo thứ tự: Triệu chứng, Chẩn đoán, Thuốc, Ảnh CT, Ảnh XQ, Ảnh MRI,
Diễn biến lâm sàng, Mức độ nghiêm trọng, Kết quả xét nghiệm. Cuối cùng chấm
**Mức độ tương tự chung** từ 1 đến 5. Chỉ có thể lưu khi đã chấm đủ 10 mục.

Kết quả lưu kèm ghi chú, người review, thời điểm, `query_patient_id`,
`similar_patient_id`, `rank` và `similarity_score` gốc để truy vết. Điểm đánh
giá của bác sĩ độc lập với cosine similarity của model. Đánh giá theo dạng mức
cũ, nếu có, được giữ nguyên cho đến khi chấm lại và xuất ở cột riêng.

## Đăng nhập và phân quyền

- Sau khi đăng nhập, người dùng vào trang **Cổng công cụ lâm sàng** trước.
  Chọn **Xác minh bệnh nhân** để mở giao diện đối chiếu; các thẻ `Sắp có` là vị
  trí dành cho tiện ích bổ sung sau này. Nút **Trang chính** trong màn hình
  verify quay lại cổng công cụ mà không cần đăng nhập lại.
- Mọi API chứa dữ liệu bệnh nhân đều yêu cầu đăng nhập bằng Bearer token.
- Tài khoản `reviewer` có thể xem hồ sơ và lưu đánh giá.
- Chỉ tài khoản `admin` thấy khu vực **Quản lý tài khoản**, được tạo tài khoản mới và được xem/tải kết quả CSV hoặc JSON. Backend vẫn kiểm tra quyền admin nếu gọi endpoint trực tiếp.
- Mật khẩu được băm bằng `scrypt`; file người dùng và kết quả đánh giá nằm trong volume dữ liệu riêng. Phiên đăng nhập có hạn 12 giờ và bị xóa khi backend khởi động lại.

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
├── sample_data/ # Gói demo ~200 MB, không được commit vào Git
├── backend/     # Express API, lớp đọc dữ liệu và lưu kết quả verification
└── frontend/    # React UI hai panel đối chiếu
```

## Gói dữ liệu demo cho Railway

Thư mục `sample_data` hiện chứa đủ 5 query và Top-5 của mỗi query (30 bệnh nhân duy nhất):

```text
sample_data/
├── raw/                                      # EHR, lab và imaging đã rút gọn
├── retrieval/top5_related_patients.csv      # đúng 25 cặp, rank 1–5
├── retrieval.json                           # đúng 5 query
└── manifest.json                            # thống kê và tham số rút gọn
```

- CT/MRI giữ tối đa 3 lát đại diện cho mỗi series, cạnh dài tối đa 512 px.
- XQ giữ 1 ảnh cho mỗi series, cạnh dài tối đa 384 px.
- Toàn bộ EHR, lab và cấu trúc study/series được giữ lại.
- 214 file NPY, khoảng 194 MB dữ liệu (khoảng 189 MiB trên Linux), giảm từ khoảng 16,9 GB raw ban đầu.

`sample_data` được `.gitignore` bỏ qua. Với backend Railway, tạo một volume mount tại `/app/data`, upload nội dung của `sample_data` vào volume, sau đó đặt các biến:

```dotenv
DATA_DIR=/app/data
RAW_ROOT=/app/data/raw
TOPK_FILE=/app/data/retrieval/top5_related_patients.csv
RETRIEVAL_FILE=/app/data/retrieval.json
QUERY_PATIENT_ID=24179852
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<mat-khau-manh>
```

`DATA_DIR` cũng lưu `users.json` và `verifications.json`, nên tài khoản và kết quả không mất khi deploy lại. Không được commit `ADMIN_PASSWORD`; hãy khai báo nó bằng Railway Variables.

Sau khi cài Railway CLI, đăng nhập và link đúng project/service backend, có thể tạo và nạp volume từ thư mục gốc dự án như sau (thay `<volume-name>` bằng tên volume vừa tạo):

```bash
railway volume add --mount-path /app/data --service backend
railway volume files --volume <volume-name> upload ./sample_data/raw /raw
railway volume files --volume <volume-name> upload ./sample_data/retrieval /retrieval
railway volume files --volume <volume-name> upload ./sample_data/retrieval.json /retrieval.json
railway volume files --volume <volume-name> upload ./sample_data/manifest.json /manifest.json
railway volume files --volume <volume-name> list /
```

Railway hỗ trợ upload cả file lẫn thư mục bằng CLI; xem [tài liệu quản lý volume](https://docs.railway.com/cli/volume).

> Dữ liệu demo này vẫn xuất phát từ hồ sơ y tế. Trước khi public URL, cần khử định danh/đánh giá tuân thủ và giới hạn truy cập ngoài lớp đăng nhập của ứng dụng.

## Chạy bằng Docker (khuyến nghị)

- Frontend: http://localhost:5174
- Backend API: http://localhost:4001/api (hoặc cùng-origin `/api` qua frontend tại http://localhost:5174)
- 5 query được chọn trong `backend/src/data/retrieval.json`; Top-5 và điểm retrieval của từng query được lọc từ CSV production Top-20.
- Docker mặc định mount Top-20 production tại
  `/mnt/disk4/similar_cases_retrieval/data/experiments/patient_fusion/top20_attention_pool_all_patients_v1/top20_related_patients.csv`.
  Có thể override host path bằng biến `TOPK_HOST_FILE`.

Trước lần chạy đầu, tạo `.env` từ file mẫu rồi đặt tài khoản quản trị ban đầu:

```bash
cp .env.example .env
# sửa ADMIN_PASSWORD trong .env, sau đó:
docker compose up --build
```

Thông tin này chỉ dùng để khởi tạo khi volume chưa có `users.json`. Sau đó admin tạo tài khoản reviewer trong giao diện. Không commit mật khẩu thật vào repository.

Dừng: `docker compose down`
Xóa cả dữ liệu đã lưu (verifications và tài khoản): `docker compose down -v`

## Chạy không dùng Docker (phát triển local)

Backend:
```bash
cd backend
npm install
ADMIN_USERNAME=admin ADMIN_PASSWORD='mật-khẩu-mạnh' \
TOPK_FILE=/đường/dẫn/top20_related_patients.csv npm run dev
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
| POST   | /api/auth/login               | Đăng nhập và nhận Bearer token          |
| GET    | /api/auth/me                  | Đọc tài khoản đang đăng nhập            |
| POST   | /api/auth/logout              | Đăng xuất                               |
| GET    | /api/auth/users               | Danh sách tài khoản (chỉ admin)         |
| POST   | /api/auth/users               | Tạo tài khoản (chỉ admin)               |
| GET    | /api/patients                 | Danh sách rút gọn (cho sidebar)         |
| GET    | /api/patients/:id              | Chi tiết đầy đủ 1 bệnh nhân             |
| POST   | /api/patients/:id/verify       | Gửi kết quả xác minh `{status, note}`   |
| POST   | /api/comparison/:id/verify     | Lưu 9 điểm tiêu chí, điểm chung và ghi chú |
| GET    | /api/comparison/export         | Tải CSV/JSON kết quả (chỉ admin)        |

Payload mới cho `/api/comparison/:id/verify`:

```json
{
  "query_patient_id": "24179852",
  "criteria_scores": {
    "symptoms": 4,
    "diagnosis": 5,
    "medications": 3,
    "ct": 4,
    "xq": 2,
    "mri": 3,
    "clinical_course": 4,
    "severity": 4,
    "lab_results": 5
  },
  "overall_similarity": 4,
  "note": "Đã đối chiếu"
}
```

### Cập nhật danh sách retrieval và xuất đánh giá

- Sửa mảng `query_patient_ids` trong `backend/src/data/retrieval.json` và giữ đúng 5 ID. Mỗi ID phải có trong CSV và có raw data; web hiển thị theo thứ tự trong JSON, mỗi ID chỉ có rank 1–5. Với Docker đang chạy, chỉ cần lưu file và refresh web để nạp lại danh sách.
- Mỗi kết quả có 9 điểm tiêu chí và một điểm tương tự chung, đều là số nguyên 1–5.
- Hai nút **CSV** và **JSON** chỉ hiển thị cho admin và tải toàn bộ 5 kết quả hiện tại,
  gồm rank, retrieval score, 10 điểm đánh giá, mức cũ (nếu có), ghi chú, người
  review và thời điểm.
