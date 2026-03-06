import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class WebmParser {
  static parse(bytes) {
    if (!bytes || bytes.length < 4) throw new CodecMediaException("Invalid WebM data");
    return { durationMillis: null };
  }

  static isLikelyWebm(bytes) {
    return !!bytes && bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  }
}

