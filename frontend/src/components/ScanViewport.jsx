import React, { useEffect, useRef, useState } from "react";
import { API_ORIGIN, requestJson } from "../api.js";
import { C } from "../theme.js";

export default function ScanViewport({ series, modality, patient }) {
  const canvas = useRef(null);
  const drag = useRef(null);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [slice, setSlice] = useState(Math.floor((series?.sliceCount || 1) / 2));
  const [image, setImage] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setSlice(Math.floor((series?.sliceCount || 1) / 2));
    setView({ x: 0, y: 0, zoom: 1 });
  }, [series?.id]);

  useEffect(() => {
    if (!series?.sliceUrl) return undefined;
    const controller = new AbortController();
    setImage(null);
    setError("");
    requestJson(`${API_ORIGIN}${series.sliceUrl}&slice=${slice}`, "Không tải được ảnh", { signal: controller.signal })
      .then(setImage)
      .catch((requestError) => { if (requestError.name !== "AbortError") setError(requestError.message || "Không tải được ảnh"); });
    return () => controller.abort();
  }, [series?.sliceUrl, slice]);

  useEffect(() => {
    if (!image || !canvas.current) return;
    const context = canvas.current.getContext("2d");
    const bytes = Uint8Array.from(atob(image.pixels), (character) => character.charCodeAt(0));
    const rgba = new Uint8ClampedArray(image.width * image.height * 4);
    bytes.forEach((value, index) => {
      const offset = index * 4;
      rgba[offset] = value;
      rgba[offset + 1] = value;
      rgba[offset + 2] = value;
      rgba[offset + 3] = 255;
    });
    canvas.current.width = image.width;
    canvas.current.height = image.height;
    context.putImageData(new ImageData(rgba, image.width, image.height), 0, 0);
  }, [image]);

  const onDown = (event) => { drag.current = { x: event.clientX, y: event.clientY, startX: view.x, startY: view.y }; event.currentTarget.setPointerCapture(event.pointerId); };
  const onMove = (event) => { if (drag.current) setView((old) => ({ ...old, x: drag.current.startX + event.clientX - drag.current.x, y: drag.current.startY + event.clientY - drag.current.y })); };
  const onUp = () => { drag.current = null; };
  const onWheel = (event) => { event.preventDefault(); setView((old) => ({ ...old, zoom: Math.max(1, Math.min(3, old.zoom + (event.deltaY < 0 ? 0.12 : -0.12))) })); };

  return <div style={{ display: "grid", gap: 7 }}>
    <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onWheel={onWheel} onDoubleClick={() => setView({ x: 0, y: 0, zoom: 1 })} style={{ background: C.scanBg, borderRadius: 6, position: "relative", overflow: "hidden", aspectRatio: "4 / 3", border: `1px solid ${C.navySoft}`, cursor: drag.current ? "grabbing" : "grab", touchAction: "none" }}>
      <canvas ref={canvas} style={{ width: "100%", height: "100%", objectFit: "contain", transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transition: drag.current ? "none" : "transform .08s linear", display: image ? "block" : "none", imageRendering: "auto" }} />
      {!image && <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#8FE0D4", fontSize: 12 }}>{error || "Đang tải lát ảnh…"}</div>}
      <div style={overlayLeft}><div>{patient.id}</div><div style={{ opacity: .75 }}>{series.label}</div></div>
      <div style={overlayRight}><div>{modality}</div><div style={{ opacity: .75 }}>{image ? `Lát ${image.slice + 1}/${image.sliceCount}` : ""}</div></div>
    </div>
    {(series.sliceCount || 1) > 1 && <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: C.inkMuted }}>Lát <input type="range" min="0" max={series.sliceCount - 1} value={slice} onChange={(event) => setSlice(Number(event.target.value))} style={{ flex: 1 }} /><span>{slice + 1}/{series.sliceCount}</span></label>}
  </div>;
}

const overlayLeft = { position: "absolute", top: 8, left: 10, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#8FE0D4", lineHeight: 1.5, pointerEvents: "none" };
const overlayRight = { position: "absolute", top: 8, right: 10, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#8FE0D4", lineHeight: 1.5, pointerEvents: "none" };
