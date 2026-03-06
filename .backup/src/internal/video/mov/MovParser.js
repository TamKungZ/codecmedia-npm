import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class MovParser {
  static #MOV_BRANDS = new Set([
    "qt  ",
  ]);

  static parse(bytes) {
    if (!bytes || bytes.length < 12) throw new CodecMediaException("Invalid MOV data");
    return { durationMillis: null };
  }

  static isLikelyMov(bytes) {
    const brands = this.#extractBrands(bytes);
    if (brands.length === 0) return false;
    return brands.some((brand) => this.#MOV_BRANDS.has(brand));
  }

  static #extractBrands(bytes) {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
    if (buffer.length < 16) return [];
    if (buffer.slice(4, 8).toString("ascii") !== "ftyp") return [];

    let boxSize = buffer.readUInt32BE(0);
    let headerSize = 8;

    if (boxSize === 1) {
      if (buffer.length < 24) return [];
      const largeSize = this.#readU64BE(buffer, 8);
      if (largeSize == null || largeSize < 24) return [];
      boxSize = largeSize;
      headerSize = 16;
    } else if (boxSize !== 0 && boxSize < 16) {
      return [];
    }

    const end = Math.min(boxSize === 0 ? buffer.length : boxSize, buffer.length);
    if (end < headerSize + 8) return [];

    const brands = [buffer.slice(headerSize, headerSize + 4).toString("ascii").toLowerCase()];
    for (let i = headerSize + 8; i + 4 <= end; i += 4) {
      brands.push(buffer.slice(i, i + 4).toString("ascii").toLowerCase());
    }
    return brands;
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

