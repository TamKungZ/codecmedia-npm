import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class TiffParser {
  static parse(bytes) {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
    if (!this.isLikelyTiff(buffer)) {
      throw new CodecMediaException("Not a TIFF file");
    }

    const littleEndian = buffer[0] === 0x49;
    const ifdOffset = this.#readU32(buffer, 4, littleEndian);
    if (ifdOffset < 8 || ifdOffset + 2 > buffer.length) {
      throw new CodecMediaException("Invalid TIFF IFD offset");
    }

    const entryCount = this.#readU16(buffer, ifdOffset, littleEndian);
    let pos = ifdOffset + 2;
    let width = null;
    let height = null;
    let bitDepth = null;

    for (let i = 0; i < entryCount; i++) {
      if (pos + 12 > buffer.length) {
        throw new CodecMediaException("Invalid TIFF IFD entry bounds");
      }

      const tag = this.#readU16(buffer, pos, littleEndian);
      const type = this.#readU16(buffer, pos + 2, littleEndian);
      const count = this.#readU32(buffer, pos + 4, littleEndian);
      const valueOrOffset = this.#readU32(buffer, pos + 8, littleEndian);

      if ((tag === 256 || tag === 257) && count >= 1) {
        const v = this.#readTagFirstShortOrLongValue(buffer, type, count, valueOrOffset, littleEndian);
        if (v != null && v > 0) {
          if (tag === 256) width = v;
          else height = v;
        }
      } else if (tag === 258 && count >= 1) {
        const v = this.#readTagFirstShortOrLongValue(buffer, type, count, valueOrOffset, littleEndian);
        if (v != null && v > 0) {
          bitDepth = v;
        }
      }

      pos += 12;
    }

    if (width == null || height == null || width <= 0 || height <= 0) {
      throw new CodecMediaException("TIFF missing width/height tags");
    }

    return { width, height, bitDepth };
  }

  static isLikelyTiff(bytes) {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
    if (!buffer || buffer.length < 8) return false;
    const little = buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00;
    const big = buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a;
    return little || big;
  }

  static #readTagFirstShortOrLongValue(bytes, type, count, valueOrOffset, littleEndian) {
    if (type === 3) {
      if (count === 1) {
        return littleEndian ? (valueOrOffset & 0xffff) : ((valueOrOffset >>> 16) & 0xffff);
      }
      return this.#readU16(bytes, valueOrOffset, littleEndian);
    }
    if (type === 4) {
      if (count === 1) {
        return valueOrOffset;
      }
      return this.#readU32(bytes, valueOrOffset, littleEndian);
    }
    return null;
  }

  static #readU16(bytes, offset, littleEndian) {
    if (offset + 2 > bytes.length) {
      throw new CodecMediaException("Unexpected end of TIFF data");
    }
    if (littleEndian) {
      return (bytes[offset] & 0xff) | ((bytes[offset + 1] & 0xff) << 8);
    }
    return ((bytes[offset] & 0xff) << 8) | (bytes[offset + 1] & 0xff);
  }

  static #readU32(bytes, offset, littleEndian) {
    if (offset + 4 > bytes.length) {
      throw new CodecMediaException("Unexpected end of TIFF data");
    }
    if (littleEndian) {
      return (
        (bytes[offset] & 0xff)
        | ((bytes[offset + 1] & 0xff) << 8)
        | ((bytes[offset + 2] & 0xff) << 16)
        | ((bytes[offset + 3] & 0xff) << 24)
      ) >>> 0;
    }
    return (
      ((bytes[offset] & 0xff) << 24)
      | ((bytes[offset + 1] & 0xff) << 16)
      | ((bytes[offset + 2] & 0xff) << 8)
      | (bytes[offset + 3] & 0xff)
    ) >>> 0;
  }
}

