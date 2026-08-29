const base = "/sample/previews/";
const preview = (name) => `${base}${encodeURIComponent(name)}`;

export const SAMPLE_PATIENT = {
  id: "24179852", name: "Bệnh nhân mẫu", age: "—", gender: "—", admitted: "2025-06-30",
  records: [{ id: "25.052970", label: "Bệnh án 25.052970", date: "2025-06-30" }],
  ehr: {
    complaint: "Vào viện theo hẹn",
    diagnosis: "Sa sinh dục độ III gây bí tiểu, thận 2 bên ứ nước độ II. Nhiễm khuẩn niệu ổn định.",
    history: "Tăng huyết áp; điều trị nhiễm khuẩn tiết niệu nhiều lần.",
    medications: ["Chưa trích xuất đơn thuốc từ mẫu"], allergies: [],
    course: "Bệnh khoảng 01 năm với tiểu buốt, tiểu rắt, tiểu máu cuối bãi và sốt tái diễn; hiện còn đau tức nhẹ vùng hạ vị.",
    details: [
      ["Số bệnh án", "25.052970"], ["Số vào viện", "24179852"], ["Mã bệnh án", "948026"],
      ["Ngày vào viện", "2025-06-30 00:00:00"], ["Ngày ra viện", "2025-07-18 00:00:00"],
      ["Chẩn đoán ra viện", "Sa sinh dục độ III gây bí tiểu, thận 2 bên ứ nước độ II. Nhiễm khuẩn niệu ổn định."],
      ["Mã ICD", "N39.0"], ["ICD phụ", "N81.9; R33"], ["Khoa điều trị", "B2.a - Khoa Ngoại thận - Tiết niệu"],
      ["Kết quả điều trị", "Khỏi"], ["Lý do vào viện", "Vào viện theo hẹn"],
      ["Quá trình bệnh lý", "Bệnh biểu hiện khoảng 01 năm với tiểu buốt, tiểu rắt, tiểu máu cuối bãi, kèm sốt cao tái diễn; hiện còn đau tức nhẹ vùng hạ vị."],
      ["Tiền sử bản thân", "Tăng huyết áp, điều trị nhiễm khuẩn tiết niệu nhiều lần"], ["Tiền sử gia đình", "Sơ bộ chưa ghi nhận có ai mắc bệnh lý tương tự"],
      ["Dị ứng", "Không ghi nhận"], ["Rượu bia", "Không"], ["Thuốc lá", "Không"],
      ["Khám toàn thân", "Tỉnh, tiếp xúc tốt, không phù, không sốt. Da niêm nhợt, thể trạng trung bình."],
      ["Mạch", "70 lần/phút"], ["Nhịp thở", "18 lần/phút"], ["Nhiệt độ", "37°C"], ["Cân nặng", "64 kg"], ["Huyết áp", "120/80 mmHg"],
      ["Thần kinh", "Sơ bộ không ghi nhận dấu hiệu bệnh lý"], ["Tuần hoàn", "Huyết áp 120/70mmHg; tim đều, rõ, không âm thổi"],
      ["Hô hấp", "Thông khí hai phổi (+), không nghe thấy rales"], ["Tiêu hóa", "Bụng mềm, không chướng"], ["Cơ xương khớp", "Sơ bộ không ghi nhận dấu hiệu bệnh lý"],
    ],
  },
  labs: [
    { name: "WBC", value: "3.7", unit: "K/µL", range: "4 - 10", flagged: true, date: "2025-07-14", department: "C2 - Khoa Xét nghiệm Huyết Học", sample: "Máu toàn phần", diagnosis: "Sỏi niệu quản (T) 1/3 dưới; Nhiễm khuẩn hệ tiết niệu, còn thông tiểu" },
    { name: "WBC", value: "4.1", unit: "K/µL", range: "4 - 10", flagged: false, date: "2025-07-11", department: "C2 - Khoa Xét nghiệm Huyết Học", sample: "Máu toàn phần", diagnosis: "Sỏi niệu quản (T) 1/3 dưới; Nhiễm khuẩn hệ tiết niệu, còn thông tiểu" },
    { name: "WBC", value: "6.2", unit: "K/µL", range: "4 - 10", flagged: false, date: "2025-06-30", department: "C2 - Khoa Xét nghiệm Huyết Học", sample: "Máu toàn phần", diagnosis: "Sỏi niệu quản (T) 1/3 dưới; Nhiễm khuẩn hệ tiết niệu, còn thông tiểu" },
  ],
  studies: {
    XQ: [{ id: "xq-1", label: "XQ", date: "2025-06-30", images: [
      preview("25.052970__XQ__250295486_20250630__1.2.392.200046.100.14.2799384903891207758747427021849370351490__raw.png"),
      preview("25.052970__XQ__250295486_20250630__1.2.392.200046.100.14.2799384903891207758747427021849370351490__raw.png"),
    ] }],
    CT: [{ id: "ct-1", label: "CT 250298927", date: "2025-07-01", series: ["Bụng TQ 1.0 B30f", "Động mạch 1.0 B30f"], image: preview("25.052970__CT__250298927_20250701__Bung_TQ_1.0_B30f__1.3.12.2.1107.5.1.4.92143.30000025063006411839100116333__raw.png") }],
    MRI: [{ id: "mri-1", label: "MRI 250324540", date: "2025-07-11", series: ["t2_haste_sag", "t2_tse_tra"], image: preview("25.052970__MRI__250324540_20250711__t2_haste_sag__1.3.12.2.1107.5.2.53.190267.30000025071112380502100000141__raw.png") }],
  },
};
