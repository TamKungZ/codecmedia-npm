import { FlacParser } from "./FlacParser.js";
import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class FlacCodec {
  static decode(bytes, sourceRef = "<memory>") {
    const info = FlacParser.parse(bytes);
    if (info.sampleRate <= 0 || info.channels <= 0 || info.bitsPerSample <= 0) {
      throw new CodecMediaException(`Decoded FLAC has invalid stream values: ${sourceRef}`);
    }
    return info;
  }
}

