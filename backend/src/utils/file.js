import fs from "fs";
import path from "path";

export function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

export function readJson(filePath, fallback) {
  try {
    return JSON.parse(readText(filePath));
  } catch (error) {
    if (arguments.length > 1) return fallback;
    throw error;
  }
}

export function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

export function fileStat(filePath) {
  return fs.statSync(filePath, { throwIfNoEntry: false }) ?? null;
}

export function isFile(filePath) {
  return Boolean(fileStat(filePath)?.isFile());
}

export function isDirectory(dirPath) {
  return Boolean(fileStat(dirPath)?.isDirectory());
}

export function directories(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export function isSafeSegment(value) {
  return typeof value === "string" && value.length > 0 && value === path.basename(value) && !value.includes("\\");
}
