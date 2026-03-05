import { StubCodecMediaEngine } from "./internal/StubCodecMediaEngine.js";

/**
 * Entry point for creating CodecMedia engine instances.
 */
export class CodecMedia {
  /**
   * Creates a default CodecMediaEngine instance.
   * 
   * @returns {CodecMediaEngine} a new stub engine instance
   */
  static createDefault() {
    return new StubCodecMediaEngine();
  }
}

