# Hệ thống xác minh hồ sơ bệnh nhân (demo)

Frontend (React + Vite) + Backend (Node.js/Express), đóng gói bằng Docker.

⚠️ **Đây là bản demo với dữ liệu giả (mock)** — chưa kết nối DICOM thật, chưa có xác thực người
dùng (auth), và lưu trạng thái xác minh trong 1 file JSON đơn giản (không phải database thật).
KHÔNG dùng trực tiếp cho dữ liệu bệnh nhân thật nếu chưa bổ sung bảo mật/tuân thủ quy định y tế.

## Cấu trúc

```
patient-verify-app/
├── docker-compose.yml
├── backend/     # Express API — /api/patients, /api/patients/:id, /api/patients/:id/verify
└── frontend/    # React UI — sidebar hàng chờ + panel chi tiết (EHR / Hình ảnh / Xét nghiệm)
```

## Chạy bằng Docker (khuyến nghị)

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:4000/api

Dừng: `docker compose down`
Xóa cả dữ liệu đã lưu (verifications): `docker compose down -v`

## Chạy không dùng Docker (phát triển local)

Backend:
```bash
cd backend
npm install
npm run dev      # http://localhost:4000
```

Frontend (terminal khác):
```bash
cd frontend
npm install
npm run dev       # http://localhost:5173, tự gọi backend ở localhost:4000
```

## API endpoints

| Method | Path                        | Mô tả                                  |
|--------|------------------------------|-----------------------------------------|
| GET    | /api/patients                 | Danh sách rút gọn (cho sidebar)         |
| GET    | /api/patients/:id              | Chi tiết đầy đủ 1 bệnh nhân             |
| POST   | /api/patients/:id/verify       | Gửi kết quả xác minh `{status, note}`   |

`status` hợp lệ: `pending` \| `approved` \| `rejected` \| `flagged`

## Việc cần làm trước khi dùng thật (production)

- [ ] Thay file JSON bằng database thật (PostgreSQL/MongoDB) + migration
- [ ] Thêm xác thực & phân quyền (JWT/OAuth, RBAC theo vai trò bác sĩ/điều dưỡng)
- [ ] Audit log: ai xem/duyệt hồ sơ, lúc nào
- [ ] Kết nối kho lưu trữ DICOM thật (vd. Orthanc) thay ScanViewport giả lập
- [ ] Mã hóa dữ liệu khi lưu & khi truyền (HTTPS/TLS)
- [ ] Rà soát tuân thủ quy định bảo vệ dữ liệu y tế hiện hành
