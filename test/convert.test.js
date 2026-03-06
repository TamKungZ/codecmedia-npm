/**
 * convert.test.js
 *
 * Unit tests for the conversion pipeline:
 *   ConversionRouteResolver, DefaultConversionHub,
 *   SameFormatCopyConverter, WavPcmStubConverter,
 *   UnsupportedRouteConverter, ImageTranscodeConverter
 *
 * Run: node --test ./test/convert.test.js
 * (or via: npm test)
 *
 * These tests use only temp files and do NOT require real media files.
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs   from "node:fs";
import path from "node:path";
import os   from "node:os";

// ─── Modules under test ───────────────────────────────────────────────────────
import { ConversionRoute }          from "../src/internal/convert/ConversionRoute.js";
import { ConversionRouteResolver }  from "../src/internal/convert/ConversionRouteResolver.js";
import { SameFormatCopyConverter }  from "../src/internal/convert/SameFormatCopyConverter.js";
import { WavPcmStubConverter }      from "../src/internal/convert/WavPcmStubConverter.js";
import { UnsupportedRouteConverter } from "../src/internal/convert/UnsupportedRouteConverter.js";
import { DefaultConversionHub }     from "../src/internal/convert/DefaultConversionHub.js";
import { MediaType }                from "../src/model/MediaType.js";
import { ConversionOptions }        from "../src/options/ConversionOptions.js";
import { CodecMediaException }      from "../src/CodecMediaException.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal ConversionRequest object. */
function makeRequest(overrides = {}) {
  return {
    input:           overrides.input           ?? "",
    output:          overrides.output          ?? "",
    sourceExtension: overrides.sourceExtension ?? "wav",
    targetExtension: overrides.targetExtension ?? "wav",
    sourceMediaType: overrides.sourceMediaType ?? MediaType.AUDIO,
    targetMediaType: overrides.targetMediaType ?? MediaType.AUDIO,
    options:         overrides.options         ?? ConversionOptions.defaults("wav"),
  };
}

/** Write a small dummy file and return its path. */
function writeDummy(filePath, content = "DUMMY") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

// ─── Temp dir management ──────────────────────────────────────────────────────

let TMP_DIR;

before(() => {
  TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "codecmedia-convert-test-"));
});

after(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

// counter so each test gets a fresh sub-folder
let _testIdx = 0;
function tmpDir() {
  const dir = path.join(TMP_DIR, String(++_testIdx));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── ConversionRouteResolver ──────────────────────────────────────────────────

describe("ConversionRouteResolver", () => {
  it("resolves AUDIO → AUDIO", () => {
    assert.equal(
      ConversionRouteResolver.resolve(MediaType.AUDIO, MediaType.AUDIO),
      ConversionRoute.AUDIO_TO_AUDIO
    );
  });

  it("resolves AUDIO → IMAGE", () => {
    assert.equal(
      ConversionRouteResolver.resolve(MediaType.AUDIO, MediaType.IMAGE),
      ConversionRoute.AUDIO_TO_IMAGE
    );
  });

  it("resolves VIDEO → AUDIO", () => {
    assert.equal(
      ConversionRouteResolver.resolve(MediaType.VIDEO, MediaType.AUDIO),
      ConversionRoute.VIDEO_TO_AUDIO
    );
  });

  it("resolves VIDEO → VIDEO", () => {
    assert.equal(
      ConversionRouteResolver.resolve(MediaType.VIDEO, MediaType.VIDEO),
      ConversionRoute.VIDEO_TO_VIDEO
    );
  });

  it("resolves IMAGE → IMAGE", () => {
    assert.equal(
      ConversionRouteResolver.resolve(MediaType.IMAGE, MediaType.IMAGE),
      ConversionRoute.IMAGE_TO_IMAGE
    );
  });

  it("returns UNSUPPORTED for IMAGE → AUDIO", () => {
    assert.equal(
      ConversionRouteResolver.resolve(MediaType.IMAGE, MediaType.AUDIO),
      ConversionRoute.UNSUPPORTED
    );
  });

  it("returns UNSUPPORTED for null inputs", () => {
    assert.equal(ConversionRouteResolver.resolve(null, null),          ConversionRoute.UNSUPPORTED);
    assert.equal(ConversionRouteResolver.resolve(MediaType.AUDIO, null), ConversionRoute.UNSUPPORTED);
    assert.equal(ConversionRouteResolver.resolve(null, MediaType.AUDIO), ConversionRoute.UNSUPPORTED);
  });
});

// ─── SameFormatCopyConverter ──────────────────────────────────────────────────

describe("SameFormatCopyConverter", () => {
  const converter = new SameFormatCopyConverter();

  it("copies file when same format", () => {
    const dir    = tmpDir();
    const input  = path.join(dir, "in.wav");
    const output = path.join(dir, "out.wav");
    writeDummy(input, "WAVE_DATA");

    const result = converter.convert(makeRequest({ input, output,
      sourceExtension: "wav", targetExtension: "wav" }));

    assert.equal(result.outputFile, output);
    assert.equal(result.format,     "wav");
    assert.equal(result.reencoded,  false);
    assert.equal(fs.readFileSync(output, "utf8"), "WAVE_DATA");
  });

  it("creates parent directories automatically", () => {
    const dir    = tmpDir();
    const input  = path.join(dir, "in.wav");
    const output = path.join(dir, "deep", "nested", "out.wav");
    writeDummy(input);

    converter.convert(makeRequest({ input, output,
      sourceExtension: "wav", targetExtension: "wav" }));

    assert.ok(fs.existsSync(output));
  });

  it("throws when output exists and overwrite=false", () => {
    const dir    = tmpDir();
    const input  = path.join(dir, "in.wav");
    const output = path.join(dir, "out.wav");
    writeDummy(input);
    writeDummy(output);   // pre-existing output

    const opts = ConversionOptions({ targetFormat: "wav", preset: "balanced", overwrite: false });
    assert.throws(
      () => converter.convert(makeRequest({ input, output, options: opts })),
      CodecMediaException
    );
  });

  it("overwrites when overwrite=true", () => {
    const dir    = tmpDir();
    const input  = path.join(dir, "in.wav");
    const output = path.join(dir, "out.wav");
    writeDummy(input,  "NEW");
    writeDummy(output, "OLD");

    const opts = ConversionOptions({ targetFormat: "wav", preset: "balanced", overwrite: true });
    converter.convert(makeRequest({ input, output, options: opts }));

    assert.equal(fs.readFileSync(output, "utf8"), "NEW");
  });
});

// ─── WavPcmStubConverter ──────────────────────────────────────────────────────

describe("WavPcmStubConverter", () => {
  const converter = new WavPcmStubConverter();

  it("converts wav → pcm (byte copy)", () => {
    const dir    = tmpDir();
    const input  = path.join(dir, "in.wav");
    const output = path.join(dir, "out.pcm");
    writeDummy(input, "PCM_STUB");

    const result = converter.convert(makeRequest({ input, output,
      sourceExtension: "wav", targetExtension: "pcm" }));

    assert.equal(result.format,    "pcm");
    assert.equal(result.reencoded, false);
    assert.equal(fs.readFileSync(output, "utf8"), "PCM_STUB");
  });

  it("converts pcm → wav (byte copy)", () => {
    const dir    = tmpDir();
    const input  = path.join(dir, "in.pcm");
    const output = path.join(dir, "out.wav");
    writeDummy(input, "WAV_STUB");

    const result = converter.convert(makeRequest({ input, output,
      sourceExtension: "pcm", targetExtension: "wav" }));

    assert.equal(result.format, "wav");
    assert.equal(fs.readFileSync(output, "utf8"), "WAV_STUB");
  });

  it("throws for unsupported pair (e.g. wav → mp3)", () => {
    const dir    = tmpDir();
    const input  = path.join(dir, "in.wav");
    const output = path.join(dir, "out.mp3");
    writeDummy(input);

    assert.throws(
      () => converter.convert(makeRequest({ input, output,
        sourceExtension: "wav", targetExtension: "mp3" })),
      CodecMediaException
    );
  });

  it("throws when output exists and overwrite=false", () => {
    const dir    = tmpDir();
    const input  = path.join(dir, "in.wav");
    const output = path.join(dir, "out.pcm");
    writeDummy(input);
    writeDummy(output);

    const opts = ConversionOptions({ targetFormat: "pcm", preset: "balanced", overwrite: false });
    assert.throws(
      () => converter.convert(makeRequest({ input, output,
        sourceExtension: "wav", targetExtension: "pcm", options: opts })),
      CodecMediaException
    );
  });
});

// ─── UnsupportedRouteConverter ────────────────────────────────────────────────

describe("UnsupportedRouteConverter", () => {
  it("always throws CodecMediaException with given message", () => {
    const msg       = "video->audio conversion is not implemented yet";
    const converter = new UnsupportedRouteConverter(msg);

    assert.throws(
      () => converter.convert(makeRequest()),
      (err) => {
        assert.ok(err instanceof CodecMediaException);
        assert.ok(err.message.includes("video->audio"));
        return true;
      }
    );
  });

  it("message is preserved exactly", () => {
    const msg = "some-custom-unsupported-route";
    const converter = new UnsupportedRouteConverter(msg);
    try {
      converter.convert(makeRequest());
      assert.fail("Should have thrown");
    } catch (e) {
      assert.ok(e instanceof CodecMediaException);
      assert.equal(e.message, msg);
    }
  });
});

// ─── DefaultConversionHub ─────────────────────────────────────────────────────

describe("DefaultConversionHub", () => {
  const hub = new DefaultConversionHub();

  it("same extension → passthrough copy (wav → wav)", () => {
    const dir    = tmpDir();
    const input  = path.join(dir, "in.wav");
    const output = path.join(dir, "out.wav");
    writeDummy(input, "WAVE");

    const result = hub.convert(makeRequest({ input, output,
      sourceExtension: "wav", targetExtension: "wav",
      sourceMediaType: MediaType.AUDIO, targetMediaType: MediaType.AUDIO }));

    assert.equal(result.reencoded, false);
    assert.equal(fs.readFileSync(output, "utf8"), "WAVE");
  });

  it("wav → pcm routes to WavPcmStubConverter", () => {
    const dir    = tmpDir();
    const input  = path.join(dir, "in.wav");
    const output = path.join(dir, "out.pcm");
    writeDummy(input, "DATA");

    const result = hub.convert(makeRequest({ input, output,
      sourceExtension: "wav", targetExtension: "pcm",
      sourceMediaType: MediaType.AUDIO, targetMediaType: MediaType.AUDIO }));

    assert.equal(result.format,    "pcm");
    assert.equal(result.reencoded, false);
  });

  it("pcm → wav routes to WavPcmStubConverter", () => {
    const dir    = tmpDir();
    const input  = path.join(dir, "in.pcm");
    const output = path.join(dir, "out.wav");
    writeDummy(input, "DATA");

    const result = hub.convert(makeRequest({ input, output,
      sourceExtension: "pcm", targetExtension: "wav",
      sourceMediaType: MediaType.AUDIO, targetMediaType: MediaType.AUDIO }));

    assert.equal(result.format, "wav");
  });

  it("audio → audio (non wav/pcm) throws unsupported", () => {
    const dir    = tmpDir();
    const input  = path.join(dir, "in.mp3");
    const output = path.join(dir, "out.flac");
    writeDummy(input);

    assert.throws(
      () => hub.convert(makeRequest({ input, output,
        sourceExtension: "mp3", targetExtension: "flac",
        sourceMediaType: MediaType.AUDIO, targetMediaType: MediaType.AUDIO })),
      CodecMediaException
    );
  });

  it("video → audio throws unsupported", () => {
    const dir    = tmpDir();
    const input  = path.join(dir, "in.mp4");
    const output = path.join(dir, "out.mp3");
    writeDummy(input);

    assert.throws(
      () => hub.convert(makeRequest({ input, output,
        sourceExtension: "mp4", targetExtension: "mp3",
        sourceMediaType: MediaType.VIDEO, targetMediaType: MediaType.AUDIO })),
      CodecMediaException
    );
  });

  it("video → video throws unsupported", () => {
    const dir    = tmpDir();
    const input  = path.join(dir, "in.mp4");
    const output = path.join(dir, "out.webm");
    writeDummy(input);

    assert.throws(
      () => hub.convert(makeRequest({ input, output,
        sourceExtension: "mp4", targetExtension: "webm",
        sourceMediaType: MediaType.VIDEO, targetMediaType: MediaType.VIDEO })),
      CodecMediaException
    );
  });

  it("audio → image throws unsupported", () => {
    const dir    = tmpDir();
    const input  = path.join(dir, "in.mp3");
    const output = path.join(dir, "out.png");
    writeDummy(input);

    assert.throws(
      () => hub.convert(makeRequest({ input, output,
        sourceExtension: "mp3", targetExtension: "png",
        sourceMediaType: MediaType.AUDIO, targetMediaType: MediaType.IMAGE })),
      CodecMediaException
    );
  });

  it("unsupported route (IMAGE → AUDIO) throws CodecMediaException", () => {
    const dir    = tmpDir();
    const input  = path.join(dir, "in.png");
    const output = path.join(dir, "out.mp3");
    writeDummy(input);

    assert.throws(
      () => hub.convert(makeRequest({ input, output,
        sourceExtension: "png", targetExtension: "mp3",
        sourceMediaType: MediaType.IMAGE, targetMediaType: MediaType.AUDIO })),
      CodecMediaException
    );
  });

  it("image → image (no codec registered) throws CodecMediaException", () => {
    const dir    = tmpDir();
    const input  = path.join(dir, "in.png");
    const output = path.join(dir, "out.jpg");
    writeDummy(input);

    // No image codec registered → ImageTranscodeConverter should throw
    assert.throws(
      () => hub.convert(makeRequest({ input, output,
        sourceExtension: "png", targetExtension: "jpg",
        sourceMediaType: MediaType.IMAGE, targetMediaType: MediaType.IMAGE })),
      CodecMediaException
    );
  });

  it("image → image same format → passthrough (before route resolver)", () => {
    const dir    = tmpDir();
    const input  = path.join(dir, "in.png");
    const output = path.join(dir, "out.png");
    writeDummy(input, "PNG_DATA");

    const result = hub.convert(makeRequest({ input, output,
      sourceExtension: "png", targetExtension: "png",
      sourceMediaType: MediaType.IMAGE, targetMediaType: MediaType.IMAGE }));

    assert.equal(result.reencoded, false);
    assert.equal(fs.readFileSync(output, "utf8"), "PNG_DATA");
  });
});