/**
 * Custom exception for CodecMedia operations.
 * Thrown when media operations fail.
 */
export class CodecMediaException extends Error {
  /**
   * Creates a new CodecMediaException.
   * 
   * @param {string} message - error message describing what went wrong
   * @param {Error|null} cause - optional underlying cause of the error
   */
  constructor(message, cause = null) {
    super(message);
    this.name = "CodecMediaException";
    this.cause = cause;
  }
}

