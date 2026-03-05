import { CodecMediaException } from "../../errors/CodecMediaException.js";
import { ConversionRoute } from "./ConversionRoute.js";
import { ConversionRouteResolver } from "./ConversionRouteResolver.js";
import { SameFormatCopyConverter } from "./SameFormatCopyConverter.js";
import { WavPcmStubConverter } from "./WavPcmStubConverter.js";
import { UnsupportedRouteConverter } from "./UnsupportedRouteConverter.js";

/**
 * Default conversion hub implementation.
 * 
 * Routes conversion requests to appropriate converters based on media types.
 */
export class DefaultConversionHub {
  #passthroughConverter = new SameFormatCopyConverter();
  #wavPcmStubConverter = new WavPcmStubConverter();
  #videoToAudioConverter = new UnsupportedRouteConverter(
    "video->audio conversion is not implemented yet (planned conversion hub path)"
  );
  #audioToImageConverter = new UnsupportedRouteConverter(
    "audio->image (album cover) conversion is not implemented yet (planned conversion hub path)"
  );
  #videoToVideoConverter = new UnsupportedRouteConverter(
    "video->video conversion is not implemented yet (planned conversion hub path)"
  );
  #audioToAudioTranscodeConverter = new UnsupportedRouteConverter(
    "audio->audio transcoding is not implemented yet (planned conversion hub path)"
  );
  #imageToImageTranscodeConverter;

  /**
   * @param {{ imageToImageTranscodeConverter?: { convert: Function } | null }=} options
   */
  constructor(options = {}) {
    const imageToImageTranscodeConverter = options?.imageToImageTranscodeConverter ?? null;
    if (imageToImageTranscodeConverter != null && typeof imageToImageTranscodeConverter.convert !== "function") {
      throw new CodecMediaException("imageToImageTranscodeConverter must provide a convert(request) function");
    }

    this.#imageToImageTranscodeConverter = imageToImageTranscodeConverter
      ?? new UnsupportedRouteConverter(
        "image->image transcoding is not implemented in zero-dependency core (provide an opt-in external converter)"
      );
  }

  /**
   * Converts media based on the conversion request.
   * 
   * @param {Object} request - Conversion request with input, output, extensions, media types, and options
   * @returns {Object} Conversion result
   * @throws {CodecMediaException} If the conversion fails or is unsupported
   */
  convert(request) {
    if (request.sourceExtension === request.requestedExtension) {
      return this.#passthroughConverter.convert(request);
    }

    const route = ConversionRouteResolver.resolve(
      request.sourceMediaType,
      request.targetMediaType
    );

    switch (route) {
      case ConversionRoute.VIDEO_TO_AUDIO:
        return this.#videoToAudioConverter.convert(request);

      case ConversionRoute.AUDIO_TO_IMAGE:
        return this.#audioToImageConverter.convert(request);

      case ConversionRoute.VIDEO_TO_VIDEO:
        return this.#videoToVideoConverter.convert(request);

      case ConversionRoute.AUDIO_TO_AUDIO: {
        const wavPcmPair =
          (request.sourceExtension === "wav" && request.requestedExtension === "pcm") ||
          (request.sourceExtension === "pcm" && request.requestedExtension === "wav");
        if (wavPcmPair) {
          return this.#wavPcmStubConverter.convert(request);
        }
        return this.#audioToAudioTranscodeConverter.convert(request);
      }

      case ConversionRoute.IMAGE_TO_IMAGE:
        return this.#imageToImageTranscodeConverter.convert(request);

      case ConversionRoute.UNSUPPORTED:
      default:
        throw new CodecMediaException(
          `Unsupported conversion route: ${request.sourceMediaType} -> ${request.targetMediaType}`
        );
    }
  }
}

