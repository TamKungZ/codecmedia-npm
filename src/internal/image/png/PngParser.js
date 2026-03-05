import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class PngParser {
  static parse(bytes) {
    if (!bytes || bytes.length < 24) throw new CodecMediaException("Invalid PNG data");
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    return { width, height, bitDepth: bytes[24] ?? null, colorType: bytes[25] ?? null };
  }

  static isLikelyPng(bytes) {
    return (
      !!bytes && bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
    );
  }
}

