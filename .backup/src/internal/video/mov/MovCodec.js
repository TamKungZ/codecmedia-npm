import { MovParser } from "./MovParser.js";
export class MovCodec {
  static decode(bytes) {
    return MovParser.parse(bytes);
  }
}

