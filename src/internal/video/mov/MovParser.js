import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class MovParser {
  static parse(bytes) {
    if (!bytes || bytes.length < 12) throw new CodecMediaException("Invalid MOV data");
    return { durationMillis: null };
  }

  static isLikelyMov(bytes) {
    return !!bytes && bytes.length >= 12 && bytes.slice(4, 8).toString("ascii") === "ftyp";
  }
}

