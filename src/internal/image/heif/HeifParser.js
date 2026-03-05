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
    if (!bytes || bytes.length < 12) throw new CodecMediaException("Invalid HEIF data");
    return { majorBrand: bytes.slice(8, 12).toString("ascii"), width: null, height: null, bitDepth: null };
  }

  static isLikelyHeif(bytes) {
    const brands = this.#extractBrands(bytes);
    if (brands.length === 0) return false;
    return brands.some((brand) => this.#HEIF_BRANDS.has(brand));
  }

  static #extractBrands(bytes) {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
    if (buffer.length < 16) return [];
    if (buffer.slice(4, 8).toString("ascii") !== "ftyp") return [];

    const boxSize = buffer.readUInt32BE(0);
    if (boxSize < 16 || boxSize === 1) return [];

    const end = Math.min(boxSize === 0 ? buffer.length : boxSize, buffer.length);
    if (end < 16) return [];

    const brands = [buffer.slice(8, 12).toString("ascii").toLowerCase()];
    for (let i = 16; i + 4 <= end; i += 4) {
      brands.push(buffer.slice(i, i + 4).toString("ascii").toLowerCase());
    }
    return brands;
  }
}

