import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class JpegParser {
  static parse(bytes) {
    if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      throw new CodecMediaException("Invalid JPEG data");
    }
    return { width: null, height: null, bitsPerSample: null, channels: null };
  }

  static isLikelyJpeg(bytes) {
    return !!bytes && bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
  }
}

