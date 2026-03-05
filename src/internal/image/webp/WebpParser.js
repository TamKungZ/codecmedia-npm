import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class WebpParser {
  static parse(bytes) {
    if (!bytes || bytes.length < 12) throw new CodecMediaException("Invalid WebP data");
    return { width: null, height: null, bitDepth: null };
  }

  static isLikelyWebp(bytes) {
    return (
      !!bytes && bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    );
  }
}

