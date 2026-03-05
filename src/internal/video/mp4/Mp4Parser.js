import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class Mp4Parser {
  static parse(bytes) {
    if (!bytes || bytes.length < 12) throw new CodecMediaException("Invalid MP4 data");
    return { durationMillis: null };
  }

  static isLikelyMp4(bytes) {
    return !!bytes && bytes.length >= 12 && bytes.slice(4, 8).toString("ascii") === "ftyp";
  }
}

