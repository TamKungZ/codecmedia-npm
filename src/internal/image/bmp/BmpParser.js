import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class BmpParser {
  static parse(bytes) {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
    if (!this.isLikelyBmp(buffer)) {
      throw new CodecMediaException("Not a BMP file");
    }

    const dibHeaderSize = this.#readU32LE(buffer, 14);
    if (dibHeaderSize < 12) {
      throw new CodecMediaException(`Unsupported BMP DIB header size: ${dibHeaderSize}`);
    }

    let width;
    let height;
    let bitsPerPixel;
    if (dibHeaderSize === 12) {
      width = this.#readU16LE(buffer, 18);
      height = this.#readU16LE(buffer, 20);
      bitsPerPixel = this.#readU16LE(buffer, 24);
    } else {
      width = this.#readI32LE(buffer, 18);
      height = Math.abs(this.#readI32LE(buffer, 22));
      bitsPerPixel = this.#readU16LE(buffer, 28);
    }

    if (width <= 0 || height <= 0) {
      throw new CodecMediaException("BMP has invalid dimensions");
    }
    if (bitsPerPixel <= 0) {
      throw new CodecMediaException("BMP has invalid bits-per-pixel");
    }

    return {
      width,
      height,
      bitsPerPixel,
    };
  }

  static isLikelyBmp(bytes) {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
    return !!buffer && buffer.length >= 26 && buffer[0] === 0x42 && buffer[1] === 0x4d;
  }

  static #readU16LE(bytes, offset) {
    if (offset + 2 > bytes.length) {
      throw new CodecMediaException("Unexpected end of BMP data");
    }
    return (bytes[offset] & 0xff) | ((bytes[offset + 1] & 0xff) << 8);
  }

  static #readU32LE(bytes, offset) {
    if (offset + 4 > bytes.length) {
      throw new CodecMediaException("Unexpected end of BMP data");
    }
    return (
      (bytes[offset] & 0xff)
      | ((bytes[offset + 1] & 0xff) << 8)
      | ((bytes[offset + 2] & 0xff) << 16)
      | ((bytes[offset + 3] & 0xff) << 24)
    ) >>> 0;
  }

  static #readI32LE(bytes, offset) {
    return this.#readU32LE(bytes, offset) | 0;
  }
}

