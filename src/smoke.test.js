import fs from "node:fs";
import path from "node:path";

import { CodecMedia } from "./index.js";

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

