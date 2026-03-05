import { OggParser } from "./OggParser.js";
import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class OggCodec {
  static decode(bytes, sourceRef = "<memory>") {
    const info = OggParser.parse(bytes);
    if (info.sampleRate <= 0 || info.channels <= 0) {
      throw new CodecMediaException(`Decoded OGG has invalid stream values: ${sourceRef}`);
    }
    return info;
  }
}

