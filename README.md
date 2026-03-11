# CodecMedia (Work in Progress)

[![npm version](https://img.shields.io/npm/v/codecmedia.svg)](https://www.npmjs.com/package/codecmedia)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-43853D?logo=node.js&logoColor=white)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-9%2B-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/)
[![Java Version](https://img.shields.io/badge/Java%20Version-codecmedia--java-007396?logo=openjdk&logoColor=white)](https://github.com/TamKungZ/codecmedia-java)

**Raw port from Java (incomplete)**

CodecMedia is a Node.js port of the original CodecMedia Java engine for media probing, validation, metadata sidecar persistence, audio extraction, playback workflow simulation, and conversion routing.

## Project Status (Important)

- This npm package is still in active development and **not all media files/formats are supported yet**.
- **WebM and WAV support are currently under testing** and may change.
- **Conversion/transcoding is not fully supported yet** (current routes are limited and mostly placeholder behavior).
- The Node.js implementation is an **incomplete port from the Java version**.

<p align="center">
  <img src="https://codecmedia.tamkungz.me/CodecMedia_Full_Logo.png" width="70%" alt="CodecMedia Logo">
</p>

## Approaches
- Zero-Dependency
- Self-Contained
- Multi-Platform

## Repository Layout

- `src/` contains the Node.js implementation used by this npm package.
- `main/java/` refers to the original Java source layout in the upstream CodecMedia project lineage (not part of this npm package repository).
- npm publishing is intentionally limited to the Node.js package files (`src`, `README.md`, `LICENSE`).

## Features (Current / Experimental)

- Media engine facade via `createDefault()`
- Probing support for:
  - MP3 (**available for real-file testing**, experimental)
  - OGG/Vorbis/Opus (**not ready yet**, in progress)
  - WAV (RIFF/RIFX/RF64, robust chunk scanning) (**available for real-file testing**, experimental)
  - AIFF/AIF/AIFC (COMM-based parsing) (**not ready yet**, in progress)
  - M4A (MP4 audio profile) (**not ready yet**, in progress)
  - FLAC (STREAMINFO parsing) (**not ready yet**, in progress)
  - PNG (**not ready yet**, in progress)
  - JPEG (**not ready yet**, in progress)
  - WebP (**not ready yet**, in progress)
  - BMP (**not ready yet**, in progress)
  - TIFF (**not ready yet**, in progress)
  - HEIC/HEIF/AVIF (basic BMFF parsing) (**not ready yet**, in progress)
  - MOV (QuickTime container parsing) (**not ready yet**, in progress)
  - MP4 (basic ISO BMFF parsing) (**not ready yet**, in progress)
  - WebM (**available for real-file testing**, experimental)
- Validation with size limits works; strict parser checks are partial (currently reliable for WebM and WAV, others still evolving)
- Metadata read/write with sidecar persistence (`.codecmedia.properties`) is available
- In-Node extraction workflow is available in limited mode (copy/same-format behavior, no real transcoding)
- Playback API is available for dry-run; desktop-open backend is optional and environment-dependent
- Conversion hub routing is implemented via `DefaultConversionHub` (same-format copy, `wav <-> pcm` stub, image-to-image via codec registry, unsupported routes throw explicit errors)

### Optional External Adapters (Opt-In)

- Core default behavior is pure Node.js and does not execute external binaries.
- You can opt in to external adapters by passing options to `createDefault(options)`.
- Example opt-in capabilities:
  - `enableFfprobeEnhancement: true` to enrich MOV/MP4/WebM probe output when `ffprobe` is available.
  - `imageToImageTranscodeConverter` to inject/override image converter implementation when you need custom behavior.

## API Behavior Summary

- `get(input)`: alias of `probe(input)` for convenience.
- `probe(input)`: detects media/container characteristics and returns technical stream info for supported formats.
- `readMetadata(input)`: returns derived probe metadata plus sidecar entries when present.
- `writeMetadata(input, metadata)`: validates and writes metadata to a sidecar properties file next to the input.
- `extractAudio(input, outputDir, options)`: validates audio input and writes extracted output into `outputDir`.
- `convert(input, output, options)`: performs routed conversion behavior and enforces `overwrite` handling.
- `play(input, options)`: supports dry-run playback and optional system default app launch.
- `validate(input, options)`: validates existence, max size, and optional strict parser-level checks.

## Notes and Limitations

- Current probing focuses on **technical media info** (mime/type/streams/basic tags).
- Probe routing performs a lightweight header-prefix sniff before full decode to reduce unnecessary full-file reads for clearly unsupported/unknown inputs.
- `readMetadata` uses sidecar metadata persistence; it is **not** a full embedded tag extractor (for example ID3 album art/APIC).
- Audio-to-audio conversion is not implemented yet for real transcode cases (for example `mp3 -> ogg`).
- The only temporary audio conversion path is a stub `wav <-> pcm` route and should be treated as non-final behavior.
- Same-extension conversion is passthrough copy (`reencoded=false`) via `SameFormatCopyConverter`.
- Image-to-image conversion is routed through `ImageTranscodeConverter` and requires registered image codecs.
- Unsupported routes (for example `video -> audio`, `video -> video`, `audio -> image`) intentionally throw explicit `CodecMediaException` messages.
- Rich MOV/MP4/WebM ffprobe enrichment is disabled by default and must be explicitly enabled.
- WebM and WAV parsing/probing should be considered experimental while testing is ongoing.
- For OpenAL workflows that require OGG from MP3 input, use an external transcoder first (for example ffmpeg), then play the produced OGG.

## Requirements

- Node.js 18+
- npm 9+

## Install

```bash
npm install codecmedia
```

## Quick Example

```js
import { CodecMedia } from "codecmedia";

const engine = CodecMedia.createDefault({
  enableFfprobeEnhancement: false,
});

const input = "./media/sample.mp4";

const probe = engine.probe(input);
console.log("Probe:", probe);

const validation = engine.validate(input, { strict: true, maxBytes: 500 * 1024 * 1024 });
console.log("Validation:", validation);

const metadata = engine.readMetadata(input);
console.log("Metadata:", metadata);

engine.writeMetadata(input, {
  entries: {
    title: "Demo Title",
    artist: "CodecMedia",
  },
});

const playback = engine.play(input, { dryRun: true, allowExternalApp: false });
console.log("Playback:", playback);
```

## Build & Test

```bash
npm test
```

Conversion pipeline tests are available in `test/convert.test.js` and are included by the default Node test glob.

Run only conversion tests:

```bash
node --test ./test/convert.test.js
```

## License

This project is licensed under the Apache License 2.0.

---

*by TamKungZ_*
