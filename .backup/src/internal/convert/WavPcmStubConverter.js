import fs from "node:fs";
import path from "node:path";
import { CodecMediaException } from "../../errors/CodecMediaException.js";

/**
 * Temporary stub converter for WAV <-> PCM routing.
 * 
 * This implementation does a byte-for-byte copy only. It does not perform
 * real PCM framing/transcoding.
 */
export class WavPcmStubConverter {
  /**
   * Converts between WAV and PCM formats (stub copy).
   * 
   * @param {Object} request - Conversion request
   * @returns {Object} Conversion result
   * @throws {CodecMediaException} If the conversion fails or is unsupported
   */
  convert(request) {
    const source = request.sourceExtension;
    const target = request.requestedExtension;

    const supportedPair =
      (source === "wav" && target === "pcm") ||
      (source === "pcm" && target === "wav");

    if (!supportedPair) {
      throw new CodecMediaException(
        "audio->audio transcoding is not implemented yet (supported stub pair: wav<->pcm only)"
      );
    }

    const output = request.output;
    try {
      const parent = path.dirname(output);
      if (parent) {
        fs.mkdirSync(parent, { recursive: true });
      }
      if (fs.existsSync(output) && !request.options?.overwrite) {
        throw new CodecMediaException(`Output already exists and overwrite is disabled: ${output}`);
      }
      fs.copyFileSync(request.input, output);
      return {
        outputFile: output,
        format: request.requestedExtension,
        reencoded: false,
      };
    } catch (err) {
      if (err instanceof CodecMediaException) throw err;
      throw new CodecMediaException(`Failed to convert file: ${request.input}`, err);
    }
  }
}
