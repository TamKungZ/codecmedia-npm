import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class Mp4Parser {
  static #MP4_BRANDS = new Set([
    "isom",
    "iso2",
    "iso3",
    "iso4",
    "iso5",
    "iso6",
    "avc1",
    "mp41",
    "mp42",
    "dash",
    "m4a ",
    "m4b ",
    "m4p ",
    "f4v ",
    "f4a ",
  ]);

  static parse(bytes) {
    if (!bytes || bytes.length < 12) throw new CodecMediaException("Invalid MP4 data");
    return { durationMillis: null };
  }

  static isLikelyMp4(bytes) {
    const brands = this.#extractBrands(bytes);
    if (brands.length === 0) return false;
    return brands.some((brand) => this.#MP4_BRANDS.has(brand));
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

