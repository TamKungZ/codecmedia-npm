import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class HeifParser {
  static parse(bytes) {
    if (!bytes || bytes.length < 12) throw new CodecMediaException("Invalid HEIF data");
    return { majorBrand: bytes.slice(8, 12).toString("ascii"), width: null, height: null, bitDepth: null };
  }

  static isLikelyHeif(bytes) {
    return !!bytes && bytes.length >= 12 && bytes.slice(4, 8).toString("ascii") === "ftyp";
  }
}

