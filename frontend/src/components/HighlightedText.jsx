import React from "react";
import { escapeRegExp, normalizeText } from "../utils/text.js";

export default function HighlightedText({ value, terms }) {
  const text = String(value ?? "");
  const usefulTerms = [...new Set(terms.filter(Boolean))].sort((left, right) => right.length - left.length);
  if (!usefulTerms.length) return text;
  const pattern = new RegExp(`(${usefulTerms.map(escapeRegExp).join("|")})`, "giu");
  return text.split(pattern).map((part, index) => (
    usefulTerms.some((term) => normalizeText(term) === normalizeText(part))
      ? <mark key={`${part}-${index}`} style={{ background: "#FFF0A8", color: "inherit", padding: "0 1px", borderRadius: 2 }}>{part}</mark>
      : part
  ));
}
