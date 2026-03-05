# CodecMedia

[![npm version](https://img.shields.io/npm/v/codecmedia.svg)](https://www.npmjs.com/package/codecmedia)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-43853D?logo=node.js&logoColor=white)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-9%2B-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/)

CodecMedia is a Node.js port of the original CodecMedia Java engine for media probing, validation, metadata sidecar persistence, audio extraction, playback workflow simulation, and conversion routing.

<p align="center">
  <img src="https://codecmedia.tamkungz.me/CodecMedia_Full_Logo.png" width="70%" alt="CodecMedia Logo">
</p>

## Approaches
- Zero-Dependency
- Self-Contained
- Multi-Platform

## Repository Layout

- `src/` contains the Node.js implementation used by this npm package.
- `main/java/` is the original Java source layout from the upstream project lineage.
- npm publishing is intentionally limited to the Node.js package files (`src`, `README.md`, `LICENSE`).

## Features

- Media engine facade via `createDefault()`
- Probing support for:
  - MP3
  - OGG/Vorbis/Opus
  - WAV (RIFF/WAVE)
  - AIFF/AIF/AIFC (COMM-based parsing)
  - M4A (MP4 audio profile)
  - FLAC (STREAMINFO parsing)
  - PNG
  - JPEG
  - WebP
  - BMP
  - TIFF
  - HEIC/HEIF/AVIF (basic BMFF parsing)
  - MOV (QuickTime container parsing)
  - MP4 (basic ISO BMFF parsing)
  - WebM (EBML container parsing)
- Validation with size limits and strict parser checks for MP3/OGG/WAV/PNG/JPEG/WebP/BMP/TIFF/HEIC/HEIF/AVIF/MOV/MP4/WebM
- Metadata read/write with sidecar persistence (`.codecmedia.properties`)
- In-Node extraction and conversion file operations
- Playback API with dry-run support and optional desktop-open backend
- Conversion hub routing with explicit unsupported routes and a stub `wav <-> pcm` path

### Optional External Adapters (Opt-In)

- Core default behavior is pure Node.js and does not execute external binaries.
- You can opt in to external adapters by passing options to `createDefault(options)`.
- Example opt-in capabilities:
  - `enableFfprobeEnhancement: true` to enrich MOV/MP4/WebM probe output when `ffprobe` is available.
  - `imageToImageTranscodeConverter` to inject a custom image converter implementation (for example one backed by `ffmpeg`).

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
- The only temporary audio conversion path is a stub `wav <-> pcm` route.
- Image-to-image transcoding is not enabled in the default zero-dependency core.
- Rich MOV/MP4/WebM ffprobe enrichment is disabled by default and must be explicitly enabled.
- For OpenAL workflows that require OGG from MP3 input, use an external transcoder first (for example ffmpeg), then play the produced OGG.

## Requirements

- Node.js 18+
- npm 9+

## Install

```bash
npm install codecmedia
```

## Build & Test

```bash
npm test
```

## License

This project is licensed under the Apache License 2.0.

---

*by TamKungZ_*
