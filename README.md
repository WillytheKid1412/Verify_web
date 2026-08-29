# Hệ thống xác minh bệnh nhân tương tự

Ứng dụng web hỗ trợ bác sĩ đối chiếu một **bệnh nhân truy vấn** với lần lượt 20 **bệnh nhân tương tự** do hệ thống truy hồi trả về. Dự án gồm frontend React + Vite và backend Node.js/Express, đóng gói bằng Docker.

> Bản demo đọc trực tiếp dữ liệu raw ở chế độ chỉ đọc. Phiên đối chiếu được lấy từ `backend/src/data/retrieval.json`; số kết quả hiển thị đúng bằng số phần tử trong `similar_patients`.

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

- Hiển thị bệnh nhân query và 20 kết quả theo `rank`.
- Mỗi kết quả có mã bệnh nhân, điểm tương đồng dạng phần trăm và trạng thái review.
- Bác sĩ chọn một kết quả để mở ở panel bên phải; panel query bên trái luôn giữ bệnh nhân query.
- Có ô tìm kiếm theo mã bệnh nhân và bộ đếm số kết quả đã xử lý.

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
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:4001/api (hoặc cùng-origin `/api` qua frontend tại http://localhost:5174)
- Query demo: `24179852`; danh sách và điểm retrieval nằm trong `backend/src/data/retrieval.json`.

Dừng: `docker compose down`
Xóa cả dữ liệu đã lưu (verifications): `docker compose down -v`

## Chạy không dùng Docker (phát triển local)

Backend:
```bash
cd backend
npm install
npm run dev      # http://localhost:4000 (hoặc PORT=4001 npm run dev nếu port 4000 đang bận)
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
| GET    | /api/patients                 | Danh sách rút gọn (cho sidebar)         |
| GET    | /api/patients/:id              | Chi tiết đầy đủ 1 bệnh nhân             |
| POST   | /api/patients/:id/verify       | Gửi kết quả xác minh `{status, note}`   |

`status` hợp lệ: `pending` \| `very_similar` \| `similar` \| `uncertain` \| `dissimilar` \| `very_dissimilar`

### Cập nhật danh sách retrieval và xuất đánh giá

- Sửa `backend/src/data/retrieval.json`; mỗi phần tử hợp lệ trong `similar_patients` sẽ xuất hiện ở sidebar. Với Docker đang chạy, chỉ cần lưu file và refresh web để nạp lại danh sách.
- Mỗi kết quả được bác sĩ đánh giá ở một trong năm mức: `very_similar`, `similar`, `uncertain`, `dissimilar`, `very_dissimilar`.
- Hai nút **CSV** và **JSON** trong thanh đánh giá tải toàn bộ kết quả hiện tại, gồm rank, retrieval score, mức đánh giá, ghi chú, người review và thời điểm.
