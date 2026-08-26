import React from "react";
import { C } from "../theme.js";

function seeded(i, salt = 1) {
  const x = Math.sin(i * 12.9898 * salt) * 43758.5453;
  return x - Math.floor(x);
}

export default function ScanViewport({ study, patient }) {
  const blobs = Array.from({ length: 5 }).map((_, k) => {
    const r1 = seeded(study.seedA, k + 1);
    const r2 = seeded(study.seedB, k + 2);
    const cx = 80 + r1 * 240;
    const cy = 60 + r2 * 180;
    const rx = 30 + seeded(study.seedA, k + 5) * 60;
    const ry = 20 + seeded(study.seedB, k + 6) * 50;
    const op = 0.08 + seeded(study.seedA, k + 9) * 0.18;
    return { cx, cy, rx, ry, op };
  });

  return (
    <div
      style={{
        background: C.scanBg,
        borderRadius: 6,
        position: "relative",
        overflow: "hidden",
        aspectRatio: "4 / 3",
        border: `1px solid ${C.navySoft}`,
      }}
    >
      <svg viewBox="0 0 400 300" width="100%" height="100%">
        <defs>
          <radialGradient id={`g-${study.id}`} cx="45%" cy="45%" r="65%">
            <stop offset="0%" stopColor="#3a4650" />
            <stop offset="100%" stopColor="#0a0f12" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="400" height="300" fill={`url(#g-${study.id})`} />
        {Array.from({ length: 9 }).map((_, gi) => (
          <line key={"v" + gi} x1={gi * 50} y1="0" x2={gi * 50} y2="300" stroke={C.scanGrid} strokeWidth="0.5" />
        ))}
        {Array.from({ length: 7 }).map((_, gi) => (
          <line key={"h" + gi} x1="0" y1={gi * 50} x2="400" y2={gi * 50} stroke={C.scanGrid} strokeWidth="0.5" />
        ))}
        {blobs.map((b, k) => (
          <ellipse key={k} cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry} fill="#e8ecec" opacity={b.op} />
        ))}
        <line x1="200" y1="0" x2="200" y2="300" stroke="#0E8F82" strokeWidth="0.4" opacity="0.4" strokeDasharray="2 4" />
        <line x1="0" y1="150" x2="400" y2="150" stroke="#0E8F82" strokeWidth="0.4" opacity="0.4" strokeDasharray="2 4" />
      </svg>

      <div style={{ position: "absolute", top: 8, left: 10, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#8FE0D4", lineHeight: 1.5 }}>
        <div>{patient.id} · {patient.name.toUpperCase()}</div>
        <div style={{ opacity: 0.75 }}>{patient.age}Y / {patient.gender === "Nữ" ? "F" : "M"}</div>
      </div>
      <div style={{ position: "absolute", top: 8, right: 10, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#8FE0D4", lineHeight: 1.5 }}>
        <div>{study.modality}</div>
        <div style={{ opacity: 0.75 }}>{study.date}</div>
      </div>
      <div style={{ position: "absolute", bottom: 8, left: 10, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#6FA89C" }}>
        {study.region}
      </div>
      <div style={{ position: "absolute", bottom: 8, right: 10, fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "#6FA89C" }}>
        W: 400 · L: 40
      </div>
    </div>
  );
}
