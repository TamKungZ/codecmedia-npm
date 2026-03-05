import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class HeifParser {
  static #HEIF_BRANDS = new Set([
    "heic",
    "heix",
    "hevc",
    "hevx",
    "heim",
    "heis",
    "mif1",
    "msf1",
    "avif",
    "avis",
  ]);

  static parse(bytes) {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
    const header = this.#resolveFtypHeader(buffer);
    if (!header) throw new CodecMediaException("Invalid HEIF data");
    const majorBrand = buffer.slice(header.headerSize, header.headerSize + 4).toString("ascii");
    return { majorBrand, width: null, height: null, bitDepth: null };
  }

  static isLikelyHeif(bytes) {
    const brands = this.#extractBrands(bytes);
    if (brands.length === 0) return false;
    return brands.some((brand) => this.#HEIF_BRANDS.has(brand));
  }

  static #extractBrands(bytes) {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
    const header = this.#resolveFtypHeader(buffer);
    if (!header) return [];

    const { headerSize, end } = header;

    const brands = [buffer.slice(headerSize, headerSize + 4).toString("ascii").toLowerCase()];
    for (let i = headerSize + 8; i + 4 <= end; i += 4) {
      brands.push(buffer.slice(i, i + 4).toString("ascii").toLowerCase());
    }
    return brands;
  }

  static #resolveFtypHeader(buffer) {
    if (buffer.length < 16) return null;
    if (buffer.slice(4, 8).toString("ascii") !== "ftyp") return null;

    let boxSize = buffer.readUInt32BE(0);
    let headerSize = 8;

    if (boxSize === 1) {
      if (buffer.length < 24) return null;
      const largeSize = this.#readU64BE(buffer, 8);
      if (largeSize == null || largeSize < 24) return null;
      boxSize = largeSize;
      headerSize = 16;
    } else if (boxSize !== 0 && boxSize < 16) {
      return null;
    }

    const end = Math.min(boxSize === 0 ? buffer.length : boxSize, buffer.length);
    if (end < headerSize + 8) return null;

    return { headerSize, end };
  }

  static #readU64BE(buffer, offset) {
    if (offset + 8 > buffer.length) return null;
    let value = 0n;
    for (let i = 0; i < 8; i++) {
      value = (value << 8n) | BigInt(buffer[offset + i]);
    }
    const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
    return Number(value > maxSafe ? maxSafe : value);
  }
}

