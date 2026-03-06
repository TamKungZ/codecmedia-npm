import { StubCodecMediaEngine } from "./internal/StubCodecMediaEngine.js";

/**
 * Entry point for creating CodecMedia engine instances.
 */
export class CodecMedia {
  /**
   * Creates a default CodecMediaEngine instance.
   *
   * The default engine is fully self-contained and does not execute external binaries.
   *
   * @param {{
   *   enableFfprobeEnhancement?: boolean,
   *   imageToImageTranscodeConverter?: { convert: Function } | null
   * }=} options optional opt-in adapters/features
   * @returns {CodecMediaEngine} a new stub engine instance
   */
  static createDefault(options = {}) {
    return new StubCodecMediaEngine(options);
  }
}

