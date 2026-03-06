import { AiffParser } from "./AiffParser.js";
import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class AiffCodec {
  static decode(bytes, sourceRef = "<memory>") {
    const info = AiffParser.parse(bytes);
    if (info.sampleRate <= 0 || info.channels <= 0 || info.bitrateKbps <= 0) {
      throw new CodecMediaException(`Decoded AIFF has invalid stream values: ${sourceRef}`);
    }
    return info;
  }
}

