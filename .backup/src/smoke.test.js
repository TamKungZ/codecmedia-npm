import fs from "node:fs";
import path from "node:path";

import { CodecMedia } from "./index.js";
import { PngParser } from "./internal/image/png/PngParser.js";
import { BmpParser } from "./internal/image/bmp/BmpParser.js";

const engine = CodecMedia.createDefault();
console.log("CodecMedia npm port loaded:", typeof engine.probe === "function");

const tmpDir = path.join("./", ".tmp-smoke");
fs.mkdirSync(tmpDir, { recursive: true });

const makeFtypFile = (filePath, majorBrand, compatibleBrands = []) => {
  const compatibleCount = compatibleBrands.length;
  const ftypSize = 16 + (compatibleCount * 4);
  const bytes = Buffer.alloc(ftypSize, 0);
  bytes.writeUInt32BE(ftypSize, 0);
  bytes.write("ftyp", 4, "ascii");
  bytes.write(majorBrand, 8, "ascii");
  bytes.writeUInt32BE(0, 12);
  for (let i = 0; i < compatibleCount; i++) {
    bytes.write(compatibleBrands[i], 16 + (i * 4), "ascii");
  }
  fs.writeFileSync(filePath, bytes);
};

const mp4Path = path.join(tmpDir, "sample.mp4");
const movPath = path.join(tmpDir, "sample.mov");
const heicPath = path.join(tmpDir, "sample.heic");

makeFtypFile(mp4Path, "isom", ["mp41"]);
makeFtypFile(movPath, "qt  ", ["qt  "]);
makeFtypFile(heicPath, "heic", ["mif1"]);

const mp4Probe = engine.probe(mp4Path);
const movProbe = engine.probe(movPath);
const heicProbe = engine.probe(heicPath);

if (mp4Probe.mediaType !== "VIDEO" || mp4Probe.extension !== "mp4") {
  throw new Error(`MP4 classification failed: ${JSON.stringify(mp4Probe)}`);
}
if (movProbe.mediaType !== "VIDEO" || movProbe.extension !== "mov") {
  throw new Error(`MOV classification failed: ${JSON.stringify(movProbe)}`);
}
if (heicProbe.mediaType !== "IMAGE" || (heicProbe.extension !== "heic" && heicProbe.extension !== "avif")) {
  throw new Error(`HEIC classification failed: ${JSON.stringify(heicProbe)}`);
}

const jpegBase64 = [
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMU",
  "FRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU",
  "FBQUFBQUFBT/wAARCAAEAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUF",
  "BAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVW",
  "V1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi",
  "4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAEC",
  "AxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVm",
  "Z2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq",
  "8vP09fb3+Pn6/9oADAMBAAIRAxEAPwC98Pf2f/Bf/CL2v/Es/Ueg9qKKK8HFY7Fe3n+9lu/tP/M+hyDMcb/ZWG/fz+CP2n2Xmf/Z",
].join("");

const jpgPath = path.join(tmpDir, "sample.jpg");
const pngOutPath = path.join(tmpDir, "sample_from_jpg.png");
const bmpOutPath = path.join(tmpDir, "sample_from_jpg.bmp");

fs.writeFileSync(jpgPath, Buffer.from(jpegBase64, "base64"));

const pngResult = engine.convert(jpgPath, pngOutPath, { targetFormat: "png", overwrite: true });
const bmpResult = engine.convert(jpgPath, bmpOutPath, { targetFormat: "bmp", overwrite: true });

if (pngResult.format !== "png" || pngResult.reencoded !== true) {
  throw new Error(`JPG->PNG conversion failed: ${JSON.stringify(pngResult)}`);
}
if (bmpResult.format !== "bmp" || bmpResult.reencoded !== true) {
  throw new Error(`JPG->BMP conversion failed: ${JSON.stringify(bmpResult)}`);
}

const pngBytes = fs.readFileSync(pngOutPath);
const bmpBytes = fs.readFileSync(bmpOutPath);
if (!PngParser.isLikelyPng(pngBytes)) {
  throw new Error("JPG->PNG output is not a valid PNG signature");
}
if (!BmpParser.isLikelyBmp(bmpBytes)) {
  throw new Error("JPG->BMP output is not a valid BMP signature");
}

