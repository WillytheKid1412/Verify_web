import React, { useRef, useState } from "react";
import { C } from "../theme.js";

// Viewer preview: pan bằng kéo chuột và zoom bằng con lăn. Khi có volume thật,
// component này sẽ là điểm thay thế bằng viewer CT/MRI 3D.
export default function ScanViewport({ study, patient, imageUrl }) {
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const drag = useRef(null);
  const onDown = (e) => { drag.current = { x: e.clientX, y: e.clientY, startX: view.x, startY: view.y }; e.currentTarget.setPointerCapture(e.pointerId); };
  const onMove = (e) => { if (!drag.current) return; setView((old) => ({ ...old, x: drag.current.startX + e.clientX - drag.current.x, y: drag.current.startY + e.clientY - drag.current.y })); };
  const onUp = () => { drag.current = null; };
  const onWheel = (e) => { e.preventDefault(); setView((old) => ({ ...old, zoom: Math.max(1, Math.min(3, old.zoom + (e.deltaY < 0 ? .12 : -.12))) })); };
  return <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onWheel={onWheel} onDoubleClick={() => setView({ x: 0, y: 0, zoom: 1 })} style={{ background: C.scanBg, borderRadius: 6, position: "relative", overflow: "hidden", aspectRatio: "4 / 3", border: `1px solid ${C.navySoft}`, cursor: drag.current ? "grabbing" : "grab", touchAction: "none" }}>
    <div style={{ width: "100%", height: "100%", transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transition: drag.current ? "none" : "transform .08s linear", background: "radial-gradient(ellipse at 48% 44%, #4b565e 0%, #202b31 32%, #05080a 72%)" }}>
      {imageUrl && <img src={`http://localhost:4000${imageUrl}`} alt={`${study.modality} preview`} draggable="false" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />}
      {!imageUrl && <>
      <svg viewBox="0 0 400 300" width="100%" height="100%"><g stroke={C.scanGrid} strokeWidth=".5">{Array.from({ length: 9 }, (_, n) => <line key={`v${n}`} x1={n * 50} y1="0" x2={n * 50} y2="300" />)}{Array.from({ length: 7 }, (_, n) => <line key={`h${n}`} x1="0" y1={n * 50} x2="400" y2={n * 50} />)}</g><ellipse cx="200" cy="150" rx="104" ry="125" fill="#dce4e4" opacity=".14"/></svg></>}
    </div>
    <div style={overlayLeft}><div>{patient.id}</div><div style={{ opacity: .75 }}>{patient.age}Y / {patient.gender === "Nữ" ? "F" : "M"}</div></div><div style={overlayRight}><div>{study.modality}</div><div style={{ opacity: .75 }}>{study.date}</div></div><div style={{ ...overlayLeft, top: "auto", bottom: 8, color: "#6FA89C" }}>{study.region}</div><div style={{ ...overlayRight, top: "auto", bottom: 8, color: "#6FA89C" }}>Zoom {Math.round(view.zoom * 100)}%</div>
  </div>;
}
const overlayLeft = { position: "absolute", top: 8, left: 10, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#8FE0D4", lineHeight: 1.5, pointerEvents: "none" };
const overlayRight = { position: "absolute", top: 8, right: 10, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#8FE0D4", lineHeight: 1.5, pointerEvents: "none" };
