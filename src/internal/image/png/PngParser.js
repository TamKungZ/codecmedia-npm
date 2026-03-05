import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class PngParser {
  static parse(bytes) {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
    if (!this.isLikelyPng(buffer) || buffer.length < 33) {
      throw new CodecMediaException("Invalid PNG data");
    }

    const ihdrLength = buffer.readUInt32BE(8);
    const ihdrType = buffer.toString("ascii", 12, 16);
    if (ihdrLength !== 13 || ihdrType !== "IHDR") {
      throw new CodecMediaException("Invalid PNG IHDR header");
    }

    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return {
      width,
      height,
      bitDepth: buffer[24] ?? null,
      colorType: buffer[25] ?? null,
    };
  }

  static isLikelyPng(bytes) {
    return (
      !!bytes && bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
    );
  }
}

