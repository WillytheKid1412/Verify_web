const HO = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Vũ", "Đặng", "Bùi", "Đỗ", "Ngô"];
const TEN = [
  "Văn An", "Thị Bình", "Minh Đức", "Thu Hà", "Quang Huy", "Ngọc Lan",
  "Tuấn Kiệt", "Thanh Mai", "Hải Nam", "Phương Oanh", "Đình Phúc", "Kim Chi",
  "Anh Quân", "Bảo Trân", "Xuân Sơn", "Yến Vy", "Công Thành", "Diệu Linh",
  "Trọng Nghĩa", "Mỹ Duyên",
];

const DIAGNOSES = [
  { dx: "Viêm phổi thùy dưới phải", region: "Ngực", modality: "CT", severity: 3 },
  { dx: "Gãy kín xương chày trái", region: "Chi dưới", modality: "X-quang", severity: 2 },
  { dx: "Thoát vị đĩa đệm L4-L5", region: "Cột sống thắt lưng", modality: "MRI", severity: 2 },
  { dx: "Nghi u gan hạ phân thùy VI", region: "Bụng", modality: "CT", severity: 4 },
  { dx: "Nhồi máu não cấp bán cầu trái", region: "Sọ não", modality: "MRI", severity: 5 },
  { dx: "Sỏi thận phải 8mm", region: "Hệ tiết niệu", modality: "CT", severity: 2 },
  { dx: "Tràn dịch màng phổi trái", region: "Ngực", modality: "X-quang", severity: 3 },
  { dx: "Viêm ruột thừa cấp", region: "Bụng", modality: "Siêu âm", severity: 3 },
  { dx: "Rách sụn chêm gối phải", region: "Khớp gối", modality: "MRI", severity: 1 },
  { dx: "Xuất huyết dưới nhện", region: "Sọ não", modality: "CT", severity: 5 },
];

function seeded(i, salt = 1) {
  const x = Math.sin(i * 12.9898 * salt) * 43758.5453;
  return x - Math.floor(x);
}

function genLabs(i) {
  const panels = [
    { name: "Bạch cầu (WBC)", unit: "10³/µL", range: [4, 10] },
    { name: "Hemoglobin (Hb)", unit: "g/dL", range: [12, 16] },
    { name: "Tiểu cầu (PLT)", unit: "10³/µL", range: [150, 400] },
    { name: "CRP", unit: "mg/L", range: [0, 5] },
    { name: "Creatinin", unit: "mg/dL", range: [0.6, 1.2] },
    { name: "Glucose", unit: "mg/dL", range: [70, 100] },
  ];
  return panels.map((p, idx) => {
    const r = seeded(i, idx + 2);
    const spread = (p.range[1] - p.range[0]) * 1.6;
    const val = p.range[0] - spread * 0.2 + r * spread;
    const flagged = val < p.range[0] || val > p.range[1];
    return {
      name: p.name,
      unit: p.unit,
      value: Math.round(val * 10) / 10,
      range: `${p.range[0]}–${p.range[1]}`,
      flagged,
    };
  });
}

export function generatePatients(count = 20) {
  const patients = Array.from({ length: count }).map((_, i) => {
    const dx = DIAGNOSES[i % DIAGNOSES.length];
    const age = 22 + Math.floor(seeded(i, 3) * 60);
    const gender = seeded(i, 5) > 0.52 ? "Nữ" : "Nam";
    const urgency = Math.round(dx.severity * 14 + seeded(i, 7) * 30);
    const day = 1 + Math.floor(seeded(i, 9) * 27);
    return {
      id: `BN-${String(1000 + i)}`,
      name: `${HO[i % HO.length]} ${TEN[i % TEN.length]}`,
      age,
      gender,
      admitted: `2026-08-${String(day).padStart(2, "0")}`,
      dx: dx.dx,
      region: dx.region,
      modality: dx.modality,
      urgency,
      allergies: seeded(i, 11) > 0.7 ? ["Penicillin"] : seeded(i, 13) > 0.85 ? ["Iod cản quang"] : [],
      history: [
        "Tăng huyết áp, điều trị ổn định",
        "Đái tháo đường type 2",
        "Không có tiền sử bệnh lý đặc biệt",
        "Hút thuốc lá 10 năm, đã bỏ",
        "Tiền sử phẫu thuật ổ bụng năm 2019",
      ][i % 5],
      complaint: [
        "Đau ngực, khó thở tăng dần 3 ngày",
        "Sưng đau chi sau tai nạn giao thông",
        "Đau lưng lan xuống chân trái",
        "Sụt cân, đau tức hạ sườn phải",
        "Yếu nửa người trái đột ngột",
        "Đau hông lưng phải, tiểu buốt",
        "Khó thở, đau ngực trái khi hít sâu",
        "Đau hố chậu phải, sốt nhẹ",
        "Đau gối phải khi vận động",
        "Đau đầu dữ dội đột ngột kèm nôn",
      ][i % 10],
      medications: ["Paracetamol 500mg", "Amlodipin 5mg", "Omeprazol 20mg"].slice(0, 1 + (i % 3)),
      imaging: [
        {
          id: `${dx.modality}-${i}-1`,
          modality: dx.modality,
          region: dx.region,
          date: `2026-08-${String(day).padStart(2, "0")}`,
          note: dx.dx,
          seedA: i * 3 + 1,
          seedB: i * 7 + 2,
        },
      ],
      labs: genLabs(i),
    };
  });

  return patients.sort((a, b) => b.urgency - a.urgency);
}

export const PATIENTS = generatePatients(20);
