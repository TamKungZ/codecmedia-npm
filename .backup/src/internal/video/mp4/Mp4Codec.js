import { Mp4Parser } from "./Mp4Parser.js";
export class Mp4Codec {
  static decode(bytes) {
    return Mp4Parser.parse(bytes);
  }
}

