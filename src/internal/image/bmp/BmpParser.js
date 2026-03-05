import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class BmpParser {
  static parse(bytes) {
    if (!bytes || bytes.length < 30) throw new CodecMediaException("Invalid BMP data");
    return {
      width: bytes.readInt32LE(18),
      height: Math.abs(bytes.readInt32LE(22)),
      bitsPerPixel: bytes.readUInt16LE(28),
    };
  }

  static isLikelyBmp(bytes) {
    return !!bytes && bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d;
  }
}

