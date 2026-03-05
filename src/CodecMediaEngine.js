/**
 * Core media engine contract used by CodecMedia.
 * 
 * The current default implementation focuses on practical probing/validation workflows and
 * light-weight conversion routing. For richer embedded metadata (for example MP3 album cover/APIC),
 * callers should treat probe() output as technical media info rather than full tag extraction.
 */
export class CodecMediaEngine {
  /**
   * Convenience alias of probe().
   * 
   * @param {string} input - media file path
   * @returns {Promise<Object>} probe result describing detected media characteristics
   * @throws {CodecMediaException} when probing fails
   */
  get(_input) {
    throw new Error("Not implemented");
  }

  /**
   * Detects media format and returns technical stream/container information.
   * 
   * @param {string} input - media file path
   * @returns {Promise<Object>} probe result containing mime, extension, media type, streams, and basic tags
   * @throws {CodecMediaException} when the file is missing or parsing fails
   */
  probe(_input) {
    throw new Error("Not implemented");
  }

  /**
   * Reads metadata associated with the file.
   * 
   * In the default stub implementation this reads sidecar metadata plus base probe fields,
   * not full embedded tag catalogs for every format.
   * 
   * @param {string} input - media file path
   * @returns {Promise<Object>} metadata entries
   * @throws {CodecMediaException} when reading fails
   */
  readMetadata(_input) {
    throw new Error("Not implemented");
  }

  /**
   * Writes metadata associated with the file.
   * 
   * In the default stub implementation this writes a sidecar properties file.
   * 
   * @param {string} input - media file path
   * @param {Object} metadata - metadata entries to persist
   * @returns {Promise<void>}
   * @throws {CodecMediaException} when validation or writing fails
   */
  writeMetadata(_input, _metadata) {
    throw new Error("Not implemented");
  }

  /**
   * Extracts audio from an input media file into the given output directory.
   * 
   * @param {string} input - source media file
   * @param {string} outputDir - target directory for extracted output
   * @param {Object|null} options - extraction options; implementation defaults may be used when null
   * @returns {Promise<Object>} extraction result describing output file and format
   * @throws {CodecMediaException} when extraction is unsupported or fails
   */
  extractAudio(_input, _outputDir, _options) {
    throw new Error("Not implemented");
  }

  /**
   * Converts media according to the requested options.
   * 
   * @param {string} input - source media file
   * @param {string} output - output media file path
   * @param {Object|null} options - conversion options; implementation defaults may be used when null
   * @returns {Promise<Object>} conversion result
   * @throws {CodecMediaException} when route is unsupported or conversion fails
   */
  convert(_input, _output, _options) {
    throw new Error("Not implemented");
  }

  /**
   * Starts playback/viewing for supported media.
   * 
   * @param {string} input - source media file
   * @param {Object|null} options - playback options controlling dry-run and external app behavior
   * @returns {Promise<Object>} playback result including backend and started status
   * @throws {CodecMediaException} when playback cannot be started
   */
  play(_input, _options) {
    throw new Error("Not implemented");
  }

  /**
   * Validates file existence and optional strict format constraints.
   * 
   * @param {string} input - media file path
   * @param {Object|null} options - validation options; implementation defaults may be used when null
   * @returns {Promise<Object>} validation result with warnings/errors
   * @throws {CodecMediaException}
   */
  validate(_input, _options) {
    throw new Error("Not implemented");
  }
}

