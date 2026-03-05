import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { CodecMediaEngine } from "../CodecMediaEngine.js";
import { CodecMediaException } from "../errors/CodecMediaException.js";
import { MediaType } from "../model/MediaType.js";
import {
  createExtractionResult,
  createMetadata,
  createPlaybackResult,
  createProbeResult,
  createStreamInfo,
  createValidationResult,
} from "../model/factories.js";
import { audioExtractDefaults } from "../options/AudioExtractOptions.js";
import { conversionDefaults } from "../options/ConversionOptions.js";
import { playbackDefaults } from "../options/PlaybackOptions.js";
import { validationDefaults } from "../options/ValidationOptions.js";
import { DefaultConversionHub } from "./convert/DefaultConversionHub.js";

import { Mp3Parser } from "./audio/mp3/Mp3Parser.js";
import { Mp3Codec } from "./audio/mp3/Mp3Codec.js";
import { OggParser } from "./audio/ogg/OggParser.js";
import { OggCodec } from "./audio/ogg/OggCodec.js";
import { WavParser } from "./audio/wav/WavParser.js";
import { WavCodec } from "./audio/wav/WavCodec.js";
import { AiffParser } from "./audio/aiff/AiffParser.js";
import { AiffCodec } from "./audio/aiff/AiffCodec.js";
import { FlacParser } from "./audio/flac/FlacParser.js";
import { FlacCodec } from "./audio/flac/FlacCodec.js";
import { PngParser } from "./image/png/PngParser.js";
import { JpegParser } from "./image/jpeg/JpegParser.js";
import { WebpParser } from "./image/webp/WebpParser.js";
import { BmpParser } from "./image/bmp/BmpParser.js";
import { TiffParser } from "./image/tiff/TiffParser.js";
import { HeifParser } from "./image/heif/HeifParser.js";
import { MovParser } from "./video/mov/MovParser.js";
import { MovCodec } from "./video/mov/MovCodec.js";
import { Mp4Parser } from "./video/mp4/Mp4Parser.js";
import { Mp4Codec } from "./video/mp4/Mp4Codec.js";
import { WebmParser } from "./video/webm/WebmParser.js";
import { WebmCodec } from "./video/webm/WebmCodec.js";
import { StreamKind } from "../model/StreamKind.js";

const STRICT_VALIDATION_MAX_BYTES = 32 * 1024 * 1024;
const PROBE_PREFIX_BYTES = 128 * 1024;

/**
 * Temporary stub implementation to bootstrap API integration.
 * 
 * This implementation focuses on practical probing/validation workflows and
 * light-weight conversion routing.
 */
export class StubCodecMediaEngine extends CodecMediaEngine {
  #ffprobeEnhancementEnabled;

  constructor(options = {}) {
    super();
    this.#ffprobeEnhancementEnabled = options?.enableFfprobeEnhancement === true;
    this.conversionHub = new DefaultConversionHub({
      imageToImageTranscodeConverter: options?.imageToImageTranscodeConverter ?? null,
    });
  }

  get(input) {
    return this.probe(input);
  }

  probe(input) {
    this.#ensureExists(input);
    const extension = this.#extractExtension(input);
    const size = fs.statSync(input).size;
    const prefix = this.#readProbePrefix(input);

    const likelyMp3 = extension === "mp3" || Mp3Parser.isLikelyMp3(prefix);
    const likelyOgg = extension === "ogg" || OggParser.isLikelyOgg(prefix);
    const likelyWav = extension === "wav" || WavParser.isLikelyWav(prefix);
    const likelyAiff = extension === "aif" || extension === "aiff" || extension === "aifc" || AiffParser.isLikelyAiff(prefix);
    const likelyFlac = extension === "flac" || FlacParser.isLikelyFlac(prefix);
    const likelyPng = extension === "png" || PngParser.isLikelyPng(prefix);
    const likelyJpeg = extension === "jpg" || extension === "jpeg" || JpegParser.isLikelyJpeg(prefix);
    const likelyWebp = extension === "webp" || WebpParser.isLikelyWebp(prefix);
    const likelyBmp = extension === "bmp" || BmpParser.isLikelyBmp(prefix);
    const likelyTiff = extension === "tif" || extension === "tiff" || TiffParser.isLikelyTiff(prefix);
    const likelyHeif = extension === "heic" || extension === "heif" || extension === "avif" || HeifParser.isLikelyHeif(prefix);
    const likelyMov = extension === "mov" || MovParser.isLikelyMov(prefix);
    const likelyMp4 = extension === "mp4" || extension === "m4a" || Mp4Parser.isLikelyMp4(prefix);
    const likelyWebm = extension === "webm" || WebmParser.isLikelyWebm(prefix);

    if (!(likelyMp3 || likelyOgg || likelyWav || likelyAiff || likelyFlac || likelyPng || likelyJpeg || likelyWebp || likelyBmp || likelyTiff || likelyHeif || likelyMov || likelyMp4 || likelyWebm)) {
      return createProbeResult({
        input,
        mimeType: this.#mimeTypeByExtension(extension),
        extension,
        mediaType: this.#mediaTypeByExtension(extension),
        tags: { sizeBytes: String(size) },
      });
    }

    const bytes = fs.readFileSync(input);

    if (likelyMp3) {
      if (bytes.length >= 4) {
        try {
          const info = Mp3Codec.decode(bytes, input);
          return createProbeResult({
            input,
            mimeType: "audio/mpeg",
            extension: "mp3",
            mediaType: MediaType.AUDIO,
            durationMillis: info.durationMillis,
            streams: [
              createStreamInfo({
                index: 0,
                kind: StreamKind.AUDIO,
                codec: info.codec,
                bitrateKbps: info.bitrateKbps,
                sampleRate: info.sampleRate,
                channels: info.channels,
              }),
            ],
            tags: {
              sizeBytes: String(size),
              bitrateMode: String(info.bitrateMode),
            },
          });
        } catch {
          // Fall back to extension-only probe for partial/empty temporary files.
        }
      }
      return createProbeResult({
        input,
        mimeType: "audio/mpeg",
        extension: "mp3",
        mediaType: MediaType.AUDIO,
        tags: { sizeBytes: String(size) },
      });
    }

    if (likelyOgg) {
      try {
        const info = OggCodec.decode(bytes, input);
        return createProbeResult({
          input,
          mimeType: "audio/ogg",
          extension: "ogg",
          mediaType: MediaType.AUDIO,
          durationMillis: info.durationMillis,
          streams: [
            createStreamInfo({
              index: 0,
              kind: StreamKind.AUDIO,
              codec: info.codec,
              bitrateKbps: info.bitrateKbps,
              sampleRate: info.sampleRate,
              channels: info.channels,
            }),
          ],
          tags: {
            sizeBytes: String(size),
            bitrateMode: String(info.bitrateMode),
          },
        });
      } catch {
        // Fall back to extension-only probe for malformed/partial files.
      }
      return createProbeResult({
        input,
        mimeType: "audio/ogg",
        extension: "ogg",
        mediaType: MediaType.AUDIO,
        tags: { sizeBytes: String(size) },
      });
    }

    if (likelyWav) {
      try {
        const info = WavCodec.decode(bytes, input);
        return createProbeResult({
          input,
          mimeType: "audio/wav",
          extension: "wav",
          mediaType: MediaType.AUDIO,
          durationMillis: info.durationMillis,
          streams: [
            createStreamInfo({
              index: 0,
              kind: StreamKind.AUDIO,
              codec: "pcm",
              bitrateKbps: info.bitrateKbps,
              sampleRate: info.sampleRate,
              channels: info.channels,
            }),
          ],
          tags: {
            sizeBytes: String(size),
            bitrateMode: String(info.bitrateMode),
          },
        });
      } catch {
        // Fall back to extension-only probe for malformed/partial files.
      }
      return createProbeResult({
        input,
        mimeType: "audio/wav",
        extension: "wav",
        mediaType: MediaType.AUDIO,
        tags: { sizeBytes: String(size) },
      });
    }

    if (likelyAiff) {
      const outputExt = extension === "aif" ? "aif" : (extension === "aifc" ? "aifc" : "aiff");
      try {
        const info = AiffCodec.decode(bytes, input);
        return createProbeResult({
          input,
          mimeType: "audio/aiff",
          extension: outputExt,
          mediaType: MediaType.AUDIO,
          durationMillis: info.durationMillis,
          streams: [
            createStreamInfo({
              index: 0,
              kind: StreamKind.AUDIO,
              codec: "pcm",
              bitrateKbps: info.bitrateKbps,
              sampleRate: info.sampleRate,
              channels: info.channels,
            }),
          ],
          tags: {
            sizeBytes: String(size),
            bitrateMode: String(info.bitrateMode),
          },
        });
      } catch {
        // Fall back to extension-only probe for malformed/partial files.
      }
      return createProbeResult({
        input,
        mimeType: "audio/aiff",
        extension: outputExt,
        mediaType: MediaType.AUDIO,
        tags: { sizeBytes: String(size) },
      });
    }

    if (likelyFlac) {
      try {
        const info = FlacCodec.decode(bytes, input);
        return createProbeResult({
          input,
          mimeType: "audio/flac",
          extension: "flac",
          mediaType: MediaType.AUDIO,
          durationMillis: info.durationMillis,
          streams: [
            createStreamInfo({
              index: 0,
              kind: StreamKind.AUDIO,
              codec: info.codec,
              bitrateKbps: info.bitrateKbps,
              sampleRate: info.sampleRate,
              channels: info.channels,
            }),
          ],
          tags: {
            sizeBytes: String(size),
            bitrateMode: String(info.bitrateMode),
            bitsPerSample: String(info.bitsPerSample),
          },
        });
      } catch {
        // Fall back to extension-only probe for malformed/partial files.
      }
      return createProbeResult({
        input,
        mimeType: "audio/flac",
        extension: "flac",
        mediaType: MediaType.AUDIO,
        tags: { sizeBytes: String(size) },
      });
    }

    if (likelyPng) {
      try {
        const info = PngParser.parse(bytes);
        return createProbeResult({
          input,
          mimeType: "image/png",
          extension: "png",
          mediaType: MediaType.IMAGE,
          streams: [
            createStreamInfo({
              index: 0,
              kind: StreamKind.VIDEO,
              codec: "png",
              width: info.width,
              height: info.height,
            }),
          ],
          tags: {
            sizeBytes: String(size),
            bitDepth: String(info.bitDepth),
            colorType: String(info.colorType),
          },
        });
      } catch {
        // Fall back to extension-only probe for malformed/partial files.
      }
      return createProbeResult({
        input,
        mimeType: "image/png",
        extension: "png",
        mediaType: MediaType.IMAGE,
        tags: { sizeBytes: String(size) },
      });
    }

    if (likelyJpeg) {
      const outputExt = extension === "jpeg" ? "jpeg" : "jpg";
      try {
        const info = JpegParser.parse(bytes);
        return createProbeResult({
          input,
          mimeType: "image/jpeg",
          extension: outputExt,
          mediaType: MediaType.IMAGE,
          streams: [
            createStreamInfo({
              index: 0,
              kind: StreamKind.VIDEO,
              codec: "jpeg",
              width: info.width,
              height: info.height,
            }),
          ],
          tags: {
            sizeBytes: String(size),
            bitsPerSample: String(info.bitsPerSample),
            channels: String(info.channels),
          },
        });
      } catch {
        // Fall back to extension-only probe for malformed/partial files.
      }
      return createProbeResult({
        input,
        mimeType: "image/jpeg",
        extension: outputExt,
        mediaType: MediaType.IMAGE,
        tags: { sizeBytes: String(size) },
      });
    }

    if (likelyWebp) {
      try {
        const info = WebpParser.parse(bytes);
        const tags = { sizeBytes: String(size) };
        if (info.bitDepth != null) tags.bitDepth = String(info.bitDepth);
        return createProbeResult({
          input,
          mimeType: "image/webp",
          extension: "webp",
          mediaType: MediaType.IMAGE,
          streams: [
            createStreamInfo({
              index: 0,
              kind: StreamKind.VIDEO,
              codec: "webp",
              width: info.width,
              height: info.height,
            }),
          ],
          tags,
        });
      } catch {
        // Fall back to extension-only probe for malformed/partial files.
      }
      return createProbeResult({
        input,
        mimeType: "image/webp",
        extension: "webp",
        mediaType: MediaType.IMAGE,
        tags: { sizeBytes: String(size) },
      });
    }

    if (likelyBmp) {
      try {
        const info = BmpParser.parse(bytes);
        return createProbeResult({
          input,
          mimeType: "image/bmp",
          extension: "bmp",
          mediaType: MediaType.IMAGE,
          streams: [
            createStreamInfo({
              index: 0,
              kind: StreamKind.VIDEO,
              codec: "bmp",
              width: info.width,
              height: info.height,
            }),
          ],
          tags: {
            sizeBytes: String(size),
            bitsPerPixel: String(info.bitsPerPixel),
          },
        });
      } catch {
        // Fall back to extension-only probe for malformed/partial files.
      }
      return createProbeResult({
        input,
        mimeType: "image/bmp",
        extension: "bmp",
        mediaType: MediaType.IMAGE,
        tags: { sizeBytes: String(size) },
      });
    }

    if (likelyTiff) {
      const outputExt = extension === "tiff" ? "tiff" : "tif";
      try {
        const info = TiffParser.parse(bytes);
        const tags = { sizeBytes: String(size) };
        if (info.bitDepth != null) tags.bitDepth = String(info.bitDepth);
        return createProbeResult({
          input,
          mimeType: "image/tiff",
          extension: outputExt,
          mediaType: MediaType.IMAGE,
          streams: [
            createStreamInfo({
              index: 0,
              kind: StreamKind.VIDEO,
              codec: "tiff",
              width: info.width,
              height: info.height,
            }),
          ],
          tags,
        });
      } catch {
        // Fall back to extension-only probe for malformed/partial files.
      }
      return createProbeResult({
        input,
        mimeType: "image/tiff",
        extension: outputExt,
        mediaType: MediaType.IMAGE,
        tags: { sizeBytes: String(size) },
      });
    }

    if (likelyHeif) {
      let outputExt = extension === "heif" ? "heif" : "heic";
      if (extension === "avif") outputExt = "avif";
      let mimeType = `image/${outputExt}`;
      try {
        const info = HeifParser.parse(bytes);
        const majorBrand = info.majorBrand;
        if (majorBrand === "avif" || majorBrand === "avis") {
          outputExt = "avif";
          mimeType = "image/avif";
        }
        const streams = (info.width != null && info.height != null)
          ? [createStreamInfo({ index: 0, kind: StreamKind.VIDEO, codec: outputExt, width: info.width, height: info.height })]
          : [];
        const tags = { sizeBytes: String(size), majorBrand: String(majorBrand) };
        if (info.bitDepth != null) tags.bitDepth = String(info.bitDepth);
        return createProbeResult({
          input,
          mimeType,
          extension: outputExt,
          mediaType: MediaType.IMAGE,
          streams,
          tags,
        });
      } catch {
        // Fall back to extension-only probe for malformed/partial files.
      }
      return createProbeResult({
        input,
        mimeType,
        extension: outputExt,
        mediaType: MediaType.IMAGE,
        tags: { sizeBytes: String(size) },
      });
    }

    if (likelyMov) {
      try {
        const info = MovCodec.decode(bytes, input);
        const base = createProbeResult({
          input,
          mimeType: "video/quicktime",
          extension: "mov",
          mediaType: MediaType.VIDEO,
          durationMillis: info.durationMillis ?? null,
          tags: { sizeBytes: String(size) },
        });
        return this.#maybeEnrichProbeWithFfprobe(input, base);
      } catch {
        // Fall back to extension-only probe for malformed/partial files.
      }
      const base = createProbeResult({
        input,
        mimeType: "video/quicktime",
        extension: "mov",
        mediaType: MediaType.VIDEO,
        tags: { sizeBytes: String(size) },
      });
      return this.#maybeEnrichProbeWithFfprobe(input, base);
    }

    if (likelyMp4) {
      const outputExt = extension === "m4a" ? "m4a" : "mp4";
      const mimeType = outputExt === "m4a" ? "audio/mp4" : "video/mp4";
      const mediaType = outputExt === "m4a" ? MediaType.AUDIO : MediaType.VIDEO;
      try {
        const info = Mp4Codec.decode(bytes, input);
        const base = createProbeResult({
          input,
          mimeType,
          extension: outputExt,
          mediaType,
          durationMillis: info.durationMillis ?? null,
          tags: { sizeBytes: String(size) },
        });
        return this.#maybeEnrichProbeWithFfprobe(input, base);
      } catch {
        // Fall back to extension-only probe for malformed/partial files.
      }
      const base = createProbeResult({
        input,
        mimeType,
        extension: outputExt,
        mediaType,
        tags: { sizeBytes: String(size) },
      });
      return this.#maybeEnrichProbeWithFfprobe(input, base);
    }

    if (likelyWebm) {
      try {
        const info = WebmCodec.decode(bytes, input);
        const base = createProbeResult({
          input,
          mimeType: "video/webm",
          extension: "webm",
          mediaType: MediaType.VIDEO,
          durationMillis: info.durationMillis ?? null,
          tags: { sizeBytes: String(size) },
        });
        return this.#maybeEnrichProbeWithFfprobe(input, base);
      } catch {
        // Fall back to extension-only probe for malformed/partial files.
      }
      const base = createProbeResult({
        input,
        mimeType: "video/webm",
        extension: "webm",
        mediaType: MediaType.VIDEO,
        tags: { sizeBytes: String(size) },
      });
      return this.#maybeEnrichProbeWithFfprobe(input, base);
    }

    return createProbeResult({
      input,
      mimeType: this.#mimeTypeByExtension(extension),
      extension,
      mediaType: this.#mediaTypeByExtension(extension),
      tags: { sizeBytes: String(size) },
    });
  }

  readMetadata(input) {
    this.#ensureExists(input);
    const probe = this.probe(input);
    const entries = {
      mimeType: probe.mimeType,
      extension: probe.extension,
      mediaType: probe.mediaType,
    };

    const sidecar = this.#metadataSidecarPath(input);
    if (fs.existsSync(sidecar)) {
      const lines = fs.readFileSync(sidecar, "utf8").split(/\r?\n/);
      for (const line of lines) {
        const i = line.indexOf("=");
        if (i > 0) {
          const key = line.slice(0, i).trim();
          const value = line.slice(i + 1).trim();
          if (key && !Object.hasOwn(entries, key)) entries[key] = value;
        }
      }
    }
    return createMetadata(entries);
  }

  writeMetadata(input, metadata) {
    this.#ensureExists(input);
    if (!metadata?.entries) throw new CodecMediaException("Metadata is required");
    const sorted = Object.entries(metadata.entries).sort((a, b) => a[0].localeCompare(b[0]));
    const lines = sorted.map(([k, v]) => {
      if (!k || k.trim() === "") throw new CodecMediaException("Metadata key must not be null/blank");
      if (v == null) throw new CodecMediaException(`Metadata value must not be null for key: ${k}`);
      return `${k}=${String(v)}`;
    });
    fs.writeFileSync(this.#metadataSidecarPath(input), lines.join("\n"));
  }

  extractAudio(input, outputDir, options) {
    this.#ensureExists(input);
    if (!outputDir) throw new CodecMediaException("Output directory is required");

    const probe = this.probe(input);
    const effective = options ?? audioExtractDefaults(probe.extension);
    if (probe.mediaType !== MediaType.AUDIO) throw new CodecMediaException(`Input is not an audio file: ${input}`);

    const src = this.#normalizeExtension(probe.extension);
    const dst = this.#normalizeExtension(effective.targetFormat || "");
    if (src !== dst) {
      throw new CodecMediaException(`Stub extractAudio does not transcode. Requested format '${dst}' must match source format '${src}'`);
    }

    fs.mkdirSync(outputDir, { recursive: true });
    const baseName = this.#baseName(path.basename(input));
    const outputFile = path.join(outputDir, `${baseName}_audio.${src}`);
    fs.copyFileSync(input, outputFile);
    return createExtractionResult({ outputFile, format: src });
  }

  convert(input, output, options) {
    this.#ensureExists(input);
    if (!output) throw new CodecMediaException("Output file is required");

    const sourceExtension = this.#normalizeExtension(this.#extractExtension(input));
    const inferredTargetFormat = this.#extractExtension(output);
    const effective = options ?? conversionDefaults(inferredTargetFormat);
    if (!effective.targetFormat || effective.targetFormat.trim() === "") {
      throw new CodecMediaException("ConversionOptions.targetFormat is required");
    }

    const requestedExtension = this.#normalizeExtension(effective.targetFormat);
    const sourceProbe = this.probe(input);
    return this.conversionHub.convert({
      input,
      output,
      sourceExtension,
      requestedExtension,
      sourceMediaType: sourceProbe.mediaType,
      targetMediaType: this.#mediaTypeByExtension(requestedExtension),
      options: effective,
    });
  }

  play(input, options) {
    this.#ensureExists(input);
    const probe = this.probe(input);
    const effective = options ?? playbackDefaults();

    if (probe.mediaType === MediaType.UNKNOWN) {
      throw new CodecMediaException(`Playback is not supported for unknown media type: ${input}`);
    }
    if (effective.dryRun) {
      return createPlaybackResult({
        started: true,
        backend: "dry-run",
        mediaType: probe.mediaType,
        message: "Playback simulation successful",
      });
    }

    if (effective.allowExternalApp) {
      try {
        this.#openExternalApp(input);
        return createPlaybackResult({
          started: true,
          backend: "desktop-open",
          mediaType: probe.mediaType,
          message: "Opened with system default application",
        });
      } catch (err) {
        throw new CodecMediaException(`Failed to open media with system player/viewer: ${input}`, err);
      }
    }

    throw new CodecMediaException("No playback backend available. Try dryRun=true or allowExternalApp=true");
  }

  validate(input, options) {
    const effective = options ?? validationDefaults();
    if (!fs.existsSync(input)) {
      return createValidationResult({ valid: false, errors: [`File does not exist: ${input}`] });
    }

    const size = fs.statSync(input).size;
    if (effective.maxBytes > 0 && size > effective.maxBytes) {
      return createValidationResult({
        valid: false,
        errors: [`File exceeds maxBytes: ${size} > ${effective.maxBytes}`],
      });
    }
    if (effective.strict && size > STRICT_VALIDATION_MAX_BYTES) {
      return createValidationResult({
        valid: false,
        errors: [`Strict validation is limited to files <= ${STRICT_VALIDATION_MAX_BYTES} bytes`],
      });
    }

    if (effective.strict) {
      const extension = this.#extractExtension(input);
      const bytes = fs.readFileSync(input);
      try {
        if (extension === "mp3") {
          Mp3Parser.parse(bytes);
        } else if (extension === "ogg") {
          OggParser.parse(bytes);
        } else if (extension === "wav") {
          WavParser.parse(bytes);
        } else if (extension === "aif" || extension === "aiff" || extension === "aifc") {
          AiffParser.parse(bytes);
        } else if (extension === "flac") {
          FlacParser.parse(bytes);
        } else if (extension === "png") {
          PngParser.parse(bytes);
        } else if (extension === "jpg" || extension === "jpeg") {
          JpegParser.parse(bytes);
        } else if (extension === "mov") {
          MovParser.parse(bytes);
        } else if (extension === "mp4" || extension === "m4a") {
          Mp4Parser.parse(bytes);
        } else if (extension === "webm") {
          WebmParser.parse(bytes);
        } else if (extension === "webp") {
          WebpParser.parse(bytes);
        } else if (extension === "bmp") {
          BmpParser.parse(bytes);
        } else if (extension === "tif" || extension === "tiff") {
          TiffParser.parse(bytes);
        } else if (extension === "heic" || extension === "heif" || extension === "avif") {
          HeifParser.parse(bytes);
        }
      } catch (err) {
        const message = err?.message ?? String(err);
        const label = extension || "unknown";
        return createValidationResult({
          valid: false,
          errors: [`Strict validation failed for ${label}: ${message}`],
        });
      }
    }

    return createValidationResult({ valid: true });
  }

  #readProbePrefix(input) {
    const expected = Math.min(PROBE_PREFIX_BYTES, Math.max(0, fs.statSync(input).size));
    if (expected === 0) return Buffer.alloc(0);

    const fd = fs.openSync(input, "r");
    try {
      const buffer = Buffer.alloc(expected);
      const bytesRead = fs.readSync(fd, buffer, 0, expected, 0);
      return bytesRead === expected ? buffer : buffer.subarray(0, bytesRead);
    } finally {
      fs.closeSync(fd);
    }
  }

  #maybeEnrichProbeWithFfprobe(input, baseProbe) {
    if (!this.#ffprobeEnhancementEnabled) {
      return baseProbe;
    }

    const ffprobe = this.#readFfprobeJson(input);
    if (!ffprobe) {
      return baseProbe;
    }

    const rawStreams = Array.isArray(ffprobe.streams) ? ffprobe.streams : [];
    if (rawStreams.length === 0) {
      return baseProbe;
    }

    const streams = [];
    let displayAspectRatio = null;
    let bitDepth = null;
    let videoBitrateKbps = 0;
    let audioBitrateKbps = 0;

    for (const stream of rawStreams) {
      const kind = this.#streamKindFromCodecType(stream?.codec_type);
      const codec = String(stream?.codec_name || baseProbe.extension || "unknown").toLowerCase();
      const bitrateKbps = this.#bitrateKbpsFromFfprobeStream(stream);

      if (kind === StreamKind.VIDEO) {
        if (bitrateKbps != null) {
          videoBitrateKbps += bitrateKbps;
        }
        if (!displayAspectRatio) {
          const dar = typeof stream?.display_aspect_ratio === "string"
            ? stream.display_aspect_ratio.trim()
            : "";
          if (dar && dar !== "0:1") {
            displayAspectRatio = dar;
          }
        }
        if (bitDepth == null) {
          const parsedDepth = this.#toNullableInt(stream?.bits_per_raw_sample ?? stream?.bits_per_sample);
          if (parsedDepth != null && parsedDepth > 0) {
            bitDepth = parsedDepth;
          }
        }
      }

      if (kind === StreamKind.AUDIO && bitrateKbps != null) {
        audioBitrateKbps += bitrateKbps;
      }

      streams.push(createStreamInfo({
        index: streams.length,
        kind,
        codec,
        bitrateKbps: bitrateKbps ?? null,
        sampleRate: kind === StreamKind.AUDIO ? this.#toNullableInt(stream?.sample_rate) : null,
        channels: kind === StreamKind.AUDIO ? this.#toNullableInt(stream?.channels) : null,
        width: kind === StreamKind.VIDEO ? this.#toNullableInt(stream?.width) : null,
        height: kind === StreamKind.VIDEO ? this.#toNullableInt(stream?.height) : null,
        frameRate: kind === StreamKind.VIDEO
          ? this.#parseFrameRate(stream?.avg_frame_rate ?? stream?.r_frame_rate)
          : null,
      }));
    }

    const tags = { ...(baseProbe.tags ?? {}) };
    if (displayAspectRatio) {
      tags.displayAspectRatio = displayAspectRatio;
    }
    if (bitDepth != null) {
      tags.bitDepth = String(bitDepth);
    }
    if (videoBitrateKbps > 0) {
      tags.videoBitrateKbps = String(videoBitrateKbps);
    }
    if (audioBitrateKbps > 0) {
      tags.audioBitrateKbps = String(audioBitrateKbps);
    }

    return createProbeResult({
      input: baseProbe.input,
      mimeType: baseProbe.mimeType,
      extension: baseProbe.extension,
      mediaType: baseProbe.mediaType,
      durationMillis: this.#durationMillisFromFfprobe(ffprobe) ?? baseProbe.durationMillis ?? null,
      streams: streams.length > 0 ? streams : baseProbe.streams,
      tags,
    });
  }

  #readFfprobeJson(input) {
    try {
      const output = execFileSync(
        "ffprobe",
        ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", input],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
      );
      return JSON.parse(output);
    } catch {
      return null;
    }
  }

  #durationMillisFromFfprobe(ffprobe) {
    const formatDuration = this.#toNullableNumber(ffprobe?.format?.duration);
    if (formatDuration != null && formatDuration > 0) {
      return Math.floor(formatDuration * 1000);
    }

    let maxStreamDuration = null;
    for (const stream of Array.isArray(ffprobe?.streams) ? ffprobe.streams : []) {
      const value = this.#toNullableNumber(stream?.duration);
      if (value == null || value <= 0) continue;
      if (maxStreamDuration == null || value > maxStreamDuration) {
        maxStreamDuration = value;
      }
    }

    return maxStreamDuration == null ? null : Math.floor(maxStreamDuration * 1000);
  }

  #streamKindFromCodecType(codecType) {
    switch (codecType) {
      case "audio": return StreamKind.AUDIO;
      case "video": return StreamKind.VIDEO;
      case "subtitle": return StreamKind.SUBTITLE;
      case "data": return StreamKind.DATA;
      default: return StreamKind.UNKNOWN;
    }
  }

  #bitrateKbpsFromFfprobeStream(stream) {
    const direct = this.#toNullableNumber(stream?.bit_rate);
    if (direct != null && direct > 0) {
      return Math.floor(direct / 1000);
    }

    const tagBps = this.#toNullableNumber(stream?.tags?.BPS ?? stream?.tags?.["BPS-eng"]);
    if (tagBps != null && tagBps > 0) {
      return Math.floor(tagBps / 1000);
    }

    return null;
  }

  #parseFrameRate(value) {
    if (typeof value !== "string" || value.trim() === "") return null;
    const [numRaw, denRaw] = value.split("/");
    const num = this.#toNullableNumber(numRaw);
    const den = this.#toNullableNumber(denRaw);
    if (num == null || den == null || den === 0) return null;
    return Number((num / den).toFixed(3));
  }

  #toNullableNumber(value) {
    if (value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  #toNullableInt(value) {
    const parsed = this.#toNullableNumber(value);
    if (parsed == null) return null;
    return Math.trunc(parsed);
  }

  #openExternalApp(input) {
    const target = path.resolve(input);
    if (process.platform === "win32") {
      execFileSync("cmd", ["/c", "start", "", `"${target}"`], { stdio: "ignore", windowsHide: true });
      return;
    }
    if (process.platform === "darwin") {
      execFileSync("open", [target], { stdio: "ignore" });
      return;
    }
    execFileSync("xdg-open", [target], { stdio: "ignore" });
  }

  #ensureExists(input) {
    if (!fs.existsSync(input)) throw new CodecMediaException(`File does not exist: ${input}`);
  }

  #extractExtension(input) {
    const ext = path.extname(input || "").toLowerCase();
    return ext.startsWith(".") ? ext.slice(1) : ext;
  }

  #normalizeExtension(format) {
    const value = String(format || "").trim().toLowerCase();
    return value.startsWith(".") ? value.slice(1) : value;
  }

  #metadataSidecarPath(input) {
    return path.join(path.dirname(input), `${path.basename(input)}.codecmedia.properties`);
  }

  #baseName(fileName) {
    const dot = fileName.lastIndexOf(".");
    return dot > 0 ? fileName.slice(0, dot) : fileName;
  }

  #mimeTypeByExtension(extension) {
    switch (extension) {
      case "mp4": return "video/mp4";
      case "mov": return "video/quicktime";
      case "webm": return "video/webm";
      case "m4a": return "audio/mp4";
      case "mp3": return "audio/mpeg";
      case "ogg": return "audio/ogg";
      case "wav": return "audio/wav";
      case "aif":
      case "aiff":
      case "aifc": return "audio/aiff";
      case "flac": return "audio/flac";
      case "png": return "image/png";
      case "jpg":
      case "jpeg": return "image/jpeg";
      case "webp": return "image/webp";
      case "bmp": return "image/bmp";
      case "tif":
      case "tiff": return "image/tiff";
      case "heic": return "image/heic";
      case "heif": return "image/heif";
      case "avif": return "image/avif";
      default: return "application/octet-stream";
    }
  }

  #mediaTypeByExtension(extension) {
    switch (this.#normalizeExtension(extension)) {
      case "mp3": case "ogg": case "wav": case "aif": case "aiff": case "aifc": case "pcm": case "m4a": case "aac": case "flac":
        return MediaType.AUDIO;
      case "mp4": case "mkv": case "mov": case "avi": case "webm":
        return MediaType.VIDEO;
      case "png": case "jpg": case "jpeg": case "gif": case "bmp": case "webp": case "tif": case "tiff": case "heic": case "heif": case "avif":
        return MediaType.IMAGE;
      default:
        return MediaType.UNKNOWN;
    }
  }
}

