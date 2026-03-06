import { CodecMediaException } from "../../errors/CodecMediaException.js";

/**
 * Converter that throws an error for unsupported routes.
 */
export class UnsupportedRouteConverter {
  #message;

  /**
   * Creates a new UnsupportedRouteConverter.
   * 
   * @param {string} message - Error message to throw
   */
  constructor(message) {
    this.#message = message;
  }

  /**
   * Throws an exception indicating the route is unsupported.
   * 
   * @param {Object} request - Conversion request (unused)
   * @throws {CodecMediaException} Always throws with the configured message
   */
  convert(request) {
    throw new CodecMediaException(this.#message);
  }
}
