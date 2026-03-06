import { Mp3Parser } from "./Mp3Parser.js";
import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class Mp3Codec {
  static decode(bytes, sourceRef = "<memory>") {
    const info = Mp3Parser.parse(bytes);
    if (info.sampleRate <= 0 || info.channels <= 0) {
      throw new CodecMediaException(`Decoded MP3 has invalid stream values: ${sourceRef}`);
    }
    return info;
  }
}

