import { WebmParser } from "./WebmParser.js";
export class WebmCodec {
  static decode(bytes) {
    return WebmParser.parse(bytes);
  }
}

