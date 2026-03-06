/**
 * WavPcmStubConverter
 * Port of me.tamkungz.codecmedia.internal.convert.WavPcmStubConverter
 *
 * Temporary stub converter for WAV <-> PCM routing.
 * This implementation does a byte-for-byte copy only. It does not perform
 * real PCM framing/transcoding.
 */
import fs   from "fs";
import path from "path";
import { CodecMediaException } from "../CodecMediaException.js";
import { ConversionResult }    from "../model/ConversionResult.js";

export class WavPcmStubConverter {
  /**
   * @param {import("./ConversionRequest.js").ConversionRequest} request
   * @returns {import("../model/ConversionResult.js").ConversionResult}
   * @throws {CodecMediaException}
   */
  convert(request) {
    const { input, output, sourceExtension: source, targetExtension: target, options } = request;

    const supportedPair =
      (source === "wav" && target === "pcm") ||
      (source === "pcm" && target === "wav");

    if (!supportedPair) {
      throw new CodecMediaException(
        "audio->audio transcoding is not implemented yet (supported stub pair: wav<->pcm only)"
      );
    }

    try {
      const parent = path.dirname(output);
      if (parent) fs.mkdirSync(parent, { recursive: true });

      if (fs.existsSync(output) && !options.overwrite) {
        throw new CodecMediaException(`Output already exists and overwrite is disabled: ${output}`);
      }

      fs.copyFileSync(input, output);
      return ConversionResult({ outputFile: output, format: target, reencoded: false });
    } catch (e) {
      if (e instanceof CodecMediaException) throw e;
      throw new CodecMediaException(`Failed to convert file: ${input}`, e);
    }
  }
}