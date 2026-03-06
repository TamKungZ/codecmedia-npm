import { WavParser } from "./WavParser.js";
import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class WavCodec {
  static decode(bytes, sourceRef = "<memory>") {
    const info = WavParser.parse(bytes);
    if (info.sampleRate <= 0 || info.channels <= 0 || info.bitrateKbps <= 0) {
      throw new CodecMediaException(`Decoded WAV has invalid stream values: ${sourceRef}`);
    }
    return info;
  }
}

