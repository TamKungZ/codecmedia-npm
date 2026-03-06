/**
 * DefaultConversionHub
 * Port of me.tamkungz.codecmedia.internal.convert.DefaultConversionHub
 *
 * Implements ConversionHub and routes each request to the appropriate converter.
 * Wire into StubCodecMediaEngine via the `conversionHub` option:
 *
 *   import { DefaultConversionHub } from "./internal/convert/DefaultConversionHub.js";
 *   import { StubCodecMediaEngine } from "./internal/StubCodecMediaEngine.js";
 *
 *   const engine = new StubCodecMediaEngine({ conversionHub: new DefaultConversionHub() });
 */
import { CodecMediaException }      from "../../CodecMediaException.js";
import { ConversionRoute }          from "./ConversionRoute.js";
import { ConversionRouteResolver }  from "./ConversionRouteResolver.js";
import { SameFormatCopyConverter }  from "./SameFormatCopyConverter.js";
import { WavPcmStubConverter }      from "./WavPcmStubConverter.js";
import { ImageTranscodeConverter }  from "./ImageTranscodeConverter.js";
import { UnsupportedRouteConverter } from "./UnsupportedRouteConverter.js";

export class DefaultConversionHub {
  constructor() {
    this._passthroughConverter = new SameFormatCopyConverter();
    this._wavPcmStubConverter  = new WavPcmStubConverter();
    this._imageToImageConverter = new ImageTranscodeConverter();

    this._videoToAudioConverter = new UnsupportedRouteConverter(
      "video->audio conversion is not implemented yet (planned conversion hub path)"
    );
    this._audioToImageConverter = new UnsupportedRouteConverter(
      "audio->image (album cover) conversion is not implemented yet (planned conversion hub path)"
    );
    this._videoToVideoConverter = new UnsupportedRouteConverter(
      "video->video conversion is not implemented yet (planned conversion hub path)"
    );
    this._audioToAudioTranscodeConverter = new UnsupportedRouteConverter(
      "audio->audio transcoding is not implemented yet (planned conversion hub path)"
    );
  }

  /**
   * @param {import("./ConversionRequest.js").ConversionRequest} request
   * @returns {import("../model/ConversionResult.js").ConversionResult}
   * @throws {CodecMediaException}
   */
  convert(request) {
    // Same-format → passthrough copy
    if (request.sourceExtension === request.targetExtension) {
      return this._passthroughConverter.convert(request);
    }

    const route = ConversionRouteResolver.resolve(request.sourceMediaType, request.targetMediaType);

    switch (route) {
      case ConversionRoute.VIDEO_TO_AUDIO:
        return this._videoToAudioConverter.convert(request);

      case ConversionRoute.AUDIO_TO_IMAGE:
        return this._audioToImageConverter.convert(request);

      case ConversionRoute.VIDEO_TO_VIDEO:
        return this._videoToVideoConverter.convert(request);

      case ConversionRoute.AUDIO_TO_AUDIO: {
        const src = request.sourceExtension;
        const tgt = request.targetExtension;
        const isWavPcmPair =
          (src === "wav" && tgt === "pcm") ||
          (src === "pcm" && tgt === "wav");
        return isWavPcmPair
          ? this._wavPcmStubConverter.convert(request)
          : this._audioToAudioTranscodeConverter.convert(request);
      }

      case ConversionRoute.IMAGE_TO_IMAGE:
        return this._imageToImageConverter.convert(request);

      case ConversionRoute.UNSUPPORTED:
      default:
        throw new CodecMediaException(
          `Unsupported conversion route: ${request.sourceMediaType} -> ${request.targetMediaType}`
        );
    }
  }
}