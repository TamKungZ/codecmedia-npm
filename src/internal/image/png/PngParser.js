import { CodecMediaException } from "../../../errors/CodecMediaException.js";

const PNG_SIGNATURE = [
  0x89, 0x50, 0x4e, 0x47,
  0x0d, 0x0a, 0x1a, 0x0a,
];

export class PngParser {
  static parse(bytes) {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
    if (!this.isLikelyPng(buffer)) {
      throw new CodecMediaException("Not a PNG file");
    }
    if (buffer.length < 33) {
      throw new CodecMediaException("PNG is too small");
    }

    const ihdrLength = this.#readBeInt(buffer, 8);
    if (ihdrLength !== 13) {
      throw new CodecMediaException(`Invalid IHDR length: ${ihdrLength}`);
    }

    if (!(buffer[12] === 0x49 && buffer[13] === 0x48 && buffer[14] === 0x44 && buffer[15] === 0x52)) {
      throw new CodecMediaException("PNG missing IHDR chunk");
    }

    const width = this.#readBeInt(buffer, 16);
    const height = this.#readBeInt(buffer, 20);
    const bitDepth = buffer[24] & 0xff;
    const colorType = buffer[25] & 0xff;

    if (width <= 0 || height <= 0) {
      throw new CodecMediaException("PNG has invalid dimensions");
    }

    return {
      width,
      height,
      bitDepth,
      colorType,
    };
  }

  static isLikelyPng(bytes) {
    if (!bytes || bytes.length < PNG_SIGNATURE.length) {
      return false;
    }
    for (let i = 0; i < PNG_SIGNATURE.length; i++) {
      if (bytes[i] !== PNG_SIGNATURE[i]) {
        return false;
      }
    }
    return true;
  }

  static #readBeInt(bytes, offset) {
    if (offset + 4 > bytes.length) {
      throw new CodecMediaException("Unexpected end of PNG data");
    }
    return ((bytes[offset] & 0xff) << 24)
      | ((bytes[offset + 1] & 0xff) << 16)
      | ((bytes[offset + 2] & 0xff) << 8)
      | (bytes[offset + 3] & 0xff);
  }
}

