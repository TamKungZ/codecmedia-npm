import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class WebpParser {
  static parse(bytes) {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
    if (!this.isLikelyWebp(buffer)) {
      throw new CodecMediaException("Not a WebP file");
    }
    if (buffer.length < 30) {
      throw new CodecMediaException("WebP is too small");
    }

    const chunkType = this.#fourcc(buffer, 12);
    switch (chunkType) {
      case "VP8 ":
        return this.#parseVp8(buffer);
      case "VP8L":
        return this.#parseVp8L(buffer);
      case "VP8X":
        return this.#parseVp8X(buffer);
      default:
        throw new CodecMediaException(`Unsupported WebP chunk type: ${chunkType}`);
    }
  }

  static isLikelyWebp(bytes) {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
    return !!buffer
      && buffer.length >= 12
      && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
      && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
  }

  static #parseVp8X(bytes) {
    if (bytes.length < 30) {
      throw new CodecMediaException("Invalid VP8X chunk length");
    }
    const widthMinus1 = (bytes[24] & 0xff) | ((bytes[25] & 0xff) << 8) | ((bytes[26] & 0xff) << 16);
    const heightMinus1 = (bytes[27] & 0xff) | ((bytes[28] & 0xff) << 8) | ((bytes[29] & 0xff) << 16);
    return this.#ensurePositive(widthMinus1 + 1, heightMinus1 + 1, 8, "VP8X");
  }

  static #parseVp8L(bytes) {
    if (bytes.length < 25) {
      throw new CodecMediaException("Invalid VP8L chunk length");
    }
    if ((bytes[20] & 0xff) !== 0x2f) {
      throw new CodecMediaException("Invalid VP8L signature byte");
    }
    const b1 = bytes[21] & 0xff;
    const b2 = bytes[22] & 0xff;
    const b3 = bytes[23] & 0xff;
    const b4 = bytes[24] & 0xff;
    const widthMinus1 = b1 | ((b2 & 0x3f) << 8);
    const heightMinus1 = ((b2 >> 6) & 0x03) | (b3 << 2) | ((b4 & 0x0f) << 10);
    return this.#ensurePositive(widthMinus1 + 1, heightMinus1 + 1, 8, "VP8L");
  }

  static #parseVp8(bytes) {
    if (bytes.length < 30) {
      throw new CodecMediaException("Invalid VP8 chunk length");
    }
    if ((bytes[23] & 0xff) !== 0x9d || (bytes[24] & 0xff) !== 0x01 || (bytes[25] & 0xff) !== 0x2a) {
      throw new CodecMediaException("Invalid VP8 frame start code");
    }
    const width = ((bytes[27] & 0x3f) << 8) | (bytes[26] & 0xff);
    const height = ((bytes[29] & 0x3f) << 8) | (bytes[28] & 0xff);
    return this.#ensurePositive(width, height, 8, "VP8");
  }

  static #fourcc(bytes, offset) {
    if (offset + 4 > bytes.length) {
      throw new CodecMediaException("Unexpected end of WebP data");
    }
    return Buffer.from(bytes.subarray(offset, offset + 4)).toString("ascii");
  }

  static #ensurePositive(width, height, bitDepth, variant) {
    if (width <= 0 || height <= 0) {
      throw new CodecMediaException(`WebP ${variant} has invalid dimensions`);
    }
    return { width, height, bitDepth };
  }
}

