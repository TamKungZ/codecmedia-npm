import fs from "node:fs";
import path from "node:path";
import { CodecMediaException } from "../../errors/CodecMediaException.js";

/**
 * Converter for same-format copies (passthrough).
 */
export class SameFormatCopyConverter {
  /**
   * Converts by copying the input file to the output location.
   * 
   * @param {Object} request - Conversion request
   * @returns {Object} Conversion result
   * @throws {CodecMediaException} If the conversion fails
   */
  convert(request) {
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
