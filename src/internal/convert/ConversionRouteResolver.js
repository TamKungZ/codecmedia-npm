import { MediaType } from "../../model/MediaType.js";
import { ConversionRoute } from "./ConversionRoute.js";

/**
 * Utility class to resolve conversion routes based on media types.
 */
export class ConversionRouteResolver {
  /**
   * Resolves the conversion route based on source and target media types.
   * 
   * @param {string} source - Source media type
   * @param {string} target - Target media type
   * @returns {string} The resolved conversion route
   */
  static resolve(source, target) {
    if (!source || !target) {
      return ConversionRoute.UNSUPPORTED;
    }
    if (source === MediaType.AUDIO && target === MediaType.AUDIO) {
      return ConversionRoute.AUDIO_TO_AUDIO;
    }
    if (source === MediaType.AUDIO && target === MediaType.IMAGE) {
      return ConversionRoute.AUDIO_TO_IMAGE;
    }
    if (source === MediaType.VIDEO && target === MediaType.AUDIO) {
      return ConversionRoute.VIDEO_TO_AUDIO;
    }
    if (source === MediaType.VIDEO && target === MediaType.VIDEO) {
      return ConversionRoute.VIDEO_TO_VIDEO;
    }
    if (source === MediaType.IMAGE && target === MediaType.IMAGE) {
      return ConversionRoute.IMAGE_TO_IMAGE;
    }
    return ConversionRoute.UNSUPPORTED;
  }
}
