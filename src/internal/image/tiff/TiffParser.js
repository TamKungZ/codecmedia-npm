import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class TiffParser {
  static parse(bytes) {
    if (!bytes || bytes.length < 4) throw new CodecMediaException("Invalid TIFF data");
    return { width: null, height: null, bitDepth: null };
  }

  static isLikelyTiff(bytes) {
    if (!bytes || bytes.length < 4) return false;
    const little = bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00;
    const big = bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a;
    return little || big;
  }
}

