import {
  CheckCircle2, FileText, FlaskConical, FlagTriangleRight, Image, ScanLine, XCircle,
} from "lucide-react";
import { C } from "./theme.js";

export const TABS = [
  ["ehr", "EHR", FileText],
  ["labs", "Lab result", FlaskConical],
  ["XQ", "XQ", Image],
  ["CT", "CT", ScanLine],
  ["MRI", "MRI", ScanLine],
];

export const SCORE_LEVELS = [
  ["very_similar", "Rất tương tự", CheckCircle2, C.teal],
  ["similar", "Tương tự", CheckCircle2, "#24618A"],
  ["uncertain", "Chưa rõ", FlagTriangleRight, C.amber],
  ["dissimilar", "Khác biệt", XCircle, "#9A5A1A"],
  ["very_dissimilar", "Rất khác", XCircle, C.red],
];

export function reviewColor(status) {
  return {
    very_similar: C.teal,
    similar: "#24618A",
    uncertain: C.amber,
    dissimilar: "#9A5A1A",
    very_dissimilar: C.red,
  }[status] || C.inkFaint;
}
