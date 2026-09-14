import fs from "fs";

export function npyHeader(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const prefix = Buffer.alloc(65_536);
    const bytesRead = fs.readSync(fd, prefix, 0, prefix.length, 0);
    if (bytesRead < 12 || prefix.toString("latin1", 0, 6) !== "\x93NUMPY") {
      throw new Error("raw.npy không phải định dạng NPY hợp lệ");
    }
    const major = prefix[6];
    const headerLength = major === 1 ? prefix.readUInt16LE(8) : prefix.readUInt32LE(8);
    const headerStart = major === 1 ? 10 : 12;
    const headerEnd = headerStart + headerLength;
    const text = prefix.toString("latin1", headerStart, headerEnd);
    const descriptor = text.match(/['"]descr['"]\s*:\s*['"]([^'"]+)['"]/)?.[1];
    const shapeText = text.match(/['"]shape['"]\s*:\s*\(([^)]*)\)/)?.[1];
    const fortran = /['"]fortran_order['"]\s*:\s*True/.test(text);
    const shape = shapeText?.split(",").map((value) => Number.parseInt(value.trim(), 10)).filter(Number.isFinite) || [];
    if (!descriptor || shape.length < 2 || fortran) throw new Error("Định dạng NPY chưa được hỗ trợ");
    return { fd, descriptor, shape, dataOffset: headerEnd };
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}

export function descriptorInfo(descriptor) {
  const formats = {
    "|u1": [1, (buffer, offset) => buffer.readUInt8(offset)],
    "<u1": [1, (buffer, offset) => buffer.readUInt8(offset)],
    "|i1": [1, (buffer, offset) => buffer.readInt8(offset)],
    "<i1": [1, (buffer, offset) => buffer.readInt8(offset)],
    "<u2": [2, (buffer, offset) => buffer.readUInt16LE(offset)],
    "<i2": [2, (buffer, offset) => buffer.readInt16LE(offset)],
    "<f4": [4, (buffer, offset) => buffer.readFloatLE(offset)],
    "<f8": [8, (buffer, offset) => buffer.readDoubleLE(offset)],
  };
  const info = formats[descriptor];
  if (!info) throw new Error(`dtype NPY chưa được hỗ trợ: ${descriptor}`);
  return { bytesPerValue: info[0], readValue: info[1] };
}
