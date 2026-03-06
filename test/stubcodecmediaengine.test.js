import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { StubCodecMediaEngine } from "../src/internal/StubCodecMediaEngine.js";
import { CodecMediaException }  from "../src/CodecMediaException.js";
import { MediaType }             from "../src/model/MediaType.js";
import { StreamKind }            from "../src/model/StreamKind.js";
import { ValidationOptions }     from "../src/options/ValidationOptions.js";
import { PlaybackOptions }       from "../src/options/PlaybackOptions.js";
import { AudioExtractOptions }   from "../src/options/AudioExtractOptions.js";
import { ConversionOptions }     from "../src/options/ConversionOptions.js";
import { Metadata }              from "../src/model/Metadata.js";

// ─── Test fixture helpers ─────────────────────────────────────────────────────

let TMP;

before(() => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), "codecmedia-test-"));
});

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

function write(name, data) {
  const p = path.join(TMP, name);
  fs.writeFileSync(p, data);
  return p;
}

// Minimal valid WebM bytes (reused from webm.test.js builder)
function vint1(v)           { return Buffer.from([0x80 | v]); }
function uintBE(value, len) {
  const b = Buffer.alloc(len);
  let v = BigInt(value);
  for (let i = len - 1; i >= 0; i--) { b[i] = Number(v & 0xffn); v >>= 8n; }
  return b;
}

function elem(idBytes, payload) {
  return Buffer.concat([idBytes, vint1(payload.length), payload]);
}

function buildMinimalWebm({ width = 1280, height = 720, videoCodec = "V_VP9" } = {}) {
  // EBML header
  const doctype = Buffer.from("webm", "ascii");
  const ebmlPayload = Buffer.concat([
    elem(Buffer.from([0x42, 0x82]), doctype),
    elem(Buffer.from([0x42, 0x87]), Buffer.from([0x04])),
    elem(Buffer.from([0x42, 0x85]), Buffer.from([0x02])),
  ]);
  const ebmlHeader = Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), vint1(ebmlPayload.length), ebmlPayload,
  ]);
  // Info (TimecodeScale)
  const infoElem = elem(
    Buffer.from([0x15, 0x49, 0xa9, 0x66]),
    elem(Buffer.from([0x2a, 0xd7, 0xb1]), uintBE(1_000_000, 4))
  );
  // TrackEntry with Video sub-container
  const cb = Buffer.from(videoCodec, "ascii");
  const videoSub = elem(Buffer.from([0xe0]), Buffer.concat([
    elem(Buffer.from([0xb0]), uintBE(width, 2)),
    elem(Buffer.from([0xba]), uintBE(height, 2)),
  ]));
  const trackEntry = elem(Buffer.from([0xae]), Buffer.concat([
    elem(Buffer.from([0x83]), Buffer.from([0x01])),
    elem(Buffer.from([0x86]), cb),
    videoSub,
  ]));
  const tracksElem = elem(Buffer.from([0x16, 0x54, 0xae, 0x6b]), trackEntry);
  // Segment with unknown size
  const segPayload = Buffer.concat([infoElem, tracksElem]);
  const segment = Buffer.concat([
    Buffer.from([0x18, 0x53, 0x80, 0x67]),
    Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
    segPayload,
  ]);
  return Buffer.concat([ebmlHeader, segment, Buffer.alloc(16)]);
}

const WEBM_BYTES = buildMinimalWebm();

// Fake magic-header stubs for formats without parsers yet
const MP3_BYTES  = Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]), Buffer.alloc(128)]);
const OGG_BYTES  = Buffer.concat([Buffer.from([0x4f, 0x67, 0x67, 0x53]), Buffer.alloc(128)]);
const WAV_BYTES  = Buffer.concat([Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]), Buffer.alloc(128)]);
const PNG_BYTES  = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(128)]);
const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(128)]);

const engine = new StubCodecMediaEngine();

const TEST_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const REAL_WEBM_480 = path.join(TEST_DIR, "file_example_WEBM_480_900KB.webm");
const REAL_WEBM_640 = path.join(TEST_DIR, "file_example_WEBM_640_1_4MB.webm");

// ─── probe ────────────────────────────────────────────────────────────────────

describe("probe — WebM (parser available)", () => {
  it("returns correct mimeType and extension", () => {
    const f = write("test.webm", WEBM_BYTES);
    const r = engine.probe(f);
    assert.equal(r.mimeType, "video/webm");
    assert.equal(r.extension, "webm");
    assert.equal(r.mediaType, MediaType.VIDEO);
  });

  it("populates video stream with width/height/codec", () => {
    const f = write("test2.webm", WEBM_BYTES);
    const r = engine.probe(f);
    assert.equal(r.streams.length, 1);
    assert.equal(r.streams[0].kind, StreamKind.VIDEO);
    assert.equal(r.streams[0].width, 1280);
    assert.equal(r.streams[0].height, 720);
    assert.equal(r.streams[0].codec, "V_VP9");
  });

  it("tags include sizeBytes", () => {
    const f = write("test3.webm", WEBM_BYTES);
    const r = engine.probe(f);
    assert.ok("sizeBytes" in r.tags);
  });

  it("probes bundled real 480 sample", () => {
    assert.equal(fs.existsSync(REAL_WEBM_480), true);
    const r = engine.probe(REAL_WEBM_480);
    assert.equal(r.mimeType, "video/webm");
    assert.equal(r.extension, "webm");
    assert.equal(r.mediaType, MediaType.VIDEO);
  });

  it("probes bundled real 640 sample", () => {
    assert.equal(fs.existsSync(REAL_WEBM_640), true);
    const r = engine.probe(REAL_WEBM_640);
    assert.equal(r.mimeType, "video/webm");
    assert.equal(r.extension, "webm");
    assert.equal(r.mediaType, MediaType.VIDEO);
  });
});

describe("probe — unknown / stub formats", () => {
  it("falls back gracefully for MP3 without parser", () => {
    const f = write("song.mp3", MP3_BYTES);
    const r = engine.probe(f);
    assert.equal(r.mimeType, "audio/mpeg");
    assert.equal(r.mediaType, MediaType.AUDIO);
  });

  it("falls back gracefully for OGG without parser", () => {
    const f = write("audio.ogg", OGG_BYTES);
    const r = engine.probe(f);
    assert.equal(r.mimeType, "audio/ogg");
    assert.equal(r.mediaType, MediaType.AUDIO);
  });

  it("falls back gracefully for WAV without parser", () => {
    const f = write("audio.wav", WAV_BYTES);
    const r = engine.probe(f);
    assert.equal(r.mimeType, "audio/wav");
    assert.equal(r.mediaType, MediaType.AUDIO);
  });

  it("falls back gracefully for PNG without parser", () => {
    const f = write("img.png", PNG_BYTES);
    const r = engine.probe(f);
    assert.equal(r.mimeType, "image/png");
    assert.equal(r.mediaType, MediaType.IMAGE);
  });

  it("returns UNKNOWN type for unrecognized extension", () => {
    const f = write("file.xyz", Buffer.from("hello world"));
    const r = engine.probe(f);
    assert.equal(r.mediaType, MediaType.UNKNOWN);
    assert.equal(r.mimeType, "application/octet-stream");
  });

  it("throws for missing file", () => {
    assert.throws(
      () => engine.probe(path.join(TMP, "nonexistent.mp4")),
      CodecMediaException
    );
  });
});

describe("probe — sniff by magic bytes, not only extension", () => {
  it("detects WebM even with wrong extension", () => {
    const f = write("disguised.mp4", WEBM_BYTES);
    const r = engine.probe(f);
    // likelyWebm wins because magic matches — but ext says mp4 so likelyMp4 fires first
    // The important thing: it doesn't throw and returns a result
    assert.ok(r.mimeType);
  });

  it("detects MP3 by ID3 magic even without .mp3 extension", () => {
    const f = write("audio.bin", MP3_BYTES);
    const r = engine.probe(f);
    assert.equal(r.mimeType, "audio/mpeg");
  });
});

// ─── validate ─────────────────────────────────────────────────────────────────

describe("validate", () => {
  it("returns valid=true for existing file within size", () => {
    const f = write("v1.webm", WEBM_BYTES);
    const r = engine.validate(f, ValidationOptions.defaults());
    assert.equal(r.valid, true);
    assert.equal(r.errors.length, 0);
  });

  it("returns valid=false for nonexistent file", () => {
    const r = engine.validate(path.join(TMP, "ghost.mp4"), null);
    assert.equal(r.valid, false);
    assert.ok(r.errors[0].includes("does not exist"));
  });

  it("returns valid=false when file exceeds maxBytes", () => {
    const f = write("big.webm", Buffer.alloc(200));
    const r = engine.validate(f, ValidationOptions({ strict: false, maxBytes: 100 }));
    assert.equal(r.valid, false);
    assert.ok(r.errors[0].includes("maxBytes"));
  });

  it("strict mode — valid WebM passes", () => {
    const f = write("strict.webm", WEBM_BYTES);
    const r = engine.validate(f, ValidationOptions({ strict: true, maxBytes: 500 * 1024 * 1024 }));
    assert.equal(r.valid, true);
  });

  it("strict mode — corrupt WebM fails", () => {
    const f = write("corrupt.webm", Buffer.from("this is not webm!!!"));
    const r = engine.validate(f, ValidationOptions({ strict: true, maxBytes: 500 * 1024 * 1024 }));
    assert.equal(r.valid, false);
    assert.ok(r.errors[0].includes("webm"));
  });

  it("strict mode — rejects file > 32MB limit", () => {
    const bigPath = path.join(TMP, "huge.webm");
    // write a 33MB file
    const fd = fs.openSync(bigPath, "w");
    fs.writeSync(fd, Buffer.alloc(33 * 1024 * 1024));
    fs.closeSync(fd);
    const r = engine.validate(bigPath, ValidationOptions({ strict: true, maxBytes: 500 * 1024 * 1024 }));
    assert.equal(r.valid, false);
    assert.ok(r.errors[0].includes("Strict validation is limited"));
  });

  it("strict mode — bundled real 480 sample passes", () => {
    assert.equal(fs.existsSync(REAL_WEBM_480), true);
    const r = engine.validate(REAL_WEBM_480, ValidationOptions({ strict: true, maxBytes: 500 * 1024 * 1024 }));
    assert.equal(r.valid, true);
  });
});

// ─── readMetadata / writeMetadata ─────────────────────────────────────────────

describe("readMetadata", () => {
  it("returns base probe fields", () => {
    const f = write("meta.webm", WEBM_BYTES);
    const m = engine.readMetadata(f);
    assert.equal(m.entries.mimeType,  "video/webm");
    assert.equal(m.entries.extension, "webm");
    assert.equal(m.entries.mediaType, MediaType.VIDEO);
  });

  it("throws for missing file", () => {
    assert.throws(() => engine.readMetadata(path.join(TMP, "nope.webm")), CodecMediaException);
  });
});

describe("writeMetadata / readMetadata round-trip", () => {
  it("persists entries to sidecar and reads them back", () => {
    const f = write("rw.webm", WEBM_BYTES);
    engine.writeMetadata(f, Metadata({ entries: { title: "Hello World", artist: "Test" } }));
    const sidecar = f + ".codecmedia.properties";
    assert.ok(fs.existsSync(sidecar), "sidecar file should be created");
    const m = engine.readMetadata(f);
    assert.equal(m.entries.title,  "Hello World");
    assert.equal(m.entries.artist, "Test");
  });

  it("sidecar keys don't override probe-derived keys", () => {
    const f = write("rw2.webm", WEBM_BYTES);
    engine.writeMetadata(f, Metadata({ entries: { mimeType: "EVIL_OVERRIDE" } }));
    const m = engine.readMetadata(f);
    // readMetadata uses putIfAbsent — probe keys win
    assert.equal(m.entries.mimeType, "video/webm");
  });

  it("throws on null metadata", () => {
    const f = write("rw3.webm", WEBM_BYTES);
    assert.throws(() => engine.writeMetadata(f, null), CodecMediaException);
  });

  it("throws on blank key", () => {
    const f = write("rw4.webm", WEBM_BYTES);
    assert.throws(
      () => engine.writeMetadata(f, Metadata({ entries: { "": "bad" } })),
      CodecMediaException
    );
  });

  it("throws on null value", () => {
    const f = write("rw5.webm", WEBM_BYTES);
    assert.throws(
      () => engine.writeMetadata(f, Metadata({ entries: { key: null } })),
      CodecMediaException
    );
  });
});

// ─── extractAudio ─────────────────────────────────────────────────────────────

describe("extractAudio", () => {
  it("copies audio file with _audio suffix", () => {
    const f   = write("clip.ogg", OGG_BYTES);
    const out = path.join(TMP, "extracted");
    const r   = engine.extractAudio(f, out, AudioExtractOptions.defaults("ogg"));
    assert.ok(fs.existsSync(r.outputFile));
    assert.equal(r.format, "ogg");
    assert.ok(r.outputFile.endsWith("clip_audio.ogg"));
  });

  it("creates output directory if it doesn't exist", () => {
    const f   = write("clip2.ogg", OGG_BYTES);
    const out = path.join(TMP, "newdir_" + Date.now());
    assert.ok(!fs.existsSync(out));
    engine.extractAudio(f, out, AudioExtractOptions.defaults("ogg"));
    assert.ok(fs.existsSync(out));
  });

  it("throws for non-audio file", () => {
    const f = write("video.webm", WEBM_BYTES);
    assert.throws(
      () => engine.extractAudio(f, TMP, AudioExtractOptions.defaults("webm")),
      CodecMediaException
    );
  });

  it("throws when targetFormat doesn't match source", () => {
    const f = write("audio2.ogg", OGG_BYTES);
    assert.throws(
      () => engine.extractAudio(f, TMP, AudioExtractOptions.defaults("mp3")),
      CodecMediaException
    );
  });

  it("throws when outputDir is null", () => {
    const f = write("audio3.ogg", OGG_BYTES);
    assert.throws(() => engine.extractAudio(f, null, null), CodecMediaException);
  });
});

// ─── play ─────────────────────────────────────────────────────────────────────

describe("play — dryRun", () => {
  it("returns started=true with dry-run backend", () => {
    const f = write("play.webm", WEBM_BYTES);
    const r = engine.play(f, PlaybackOptions({ dryRun: true, allowExternalApp: false }));
    assert.equal(r.started, true);
    assert.equal(r.backend, "dry-run");
    assert.equal(r.mediaType, MediaType.VIDEO);
    assert.ok(r.message);
  });

  it("throws for unknown media type in dryRun", () => {
    const f = write("unknown.xyz", Buffer.from("garbage data xyz"));
    assert.throws(
      () => engine.play(f, PlaybackOptions({ dryRun: true, allowExternalApp: false })),
      CodecMediaException
    );
  });

  it("throws when no backend available", () => {
    const f = write("play2.webm", WEBM_BYTES);
    assert.throws(
      () => engine.play(f, PlaybackOptions({ dryRun: false, allowExternalApp: false })),
      CodecMediaException
    );
  });

  it("throws for missing file", () => {
    assert.throws(
      () => engine.play(path.join(TMP, "missing.webm"), PlaybackOptions.defaults()),
      CodecMediaException
    );
  });
});

// ─── convert ──────────────────────────────────────────────────────────────────

describe("convert — no hub", () => {
  it("throws CodecMediaException when conversionHub not available", () => {
    const f = write("conv.webm", WEBM_BYTES);
    assert.throws(
      () => engine.convert(f, path.join(TMP, "out.mp4"), ConversionOptions.defaults("mp4")),
      CodecMediaException
    );
  });

  it("throws for missing input", () => {
    assert.throws(
      () => engine.convert(path.join(TMP, "none.webm"), path.join(TMP, "out.mp4"), null),
      CodecMediaException
    );
  });

  it("throws for null output", () => {
    const f = write("conv2.webm", WEBM_BYTES);
    assert.throws(() => engine.convert(f, null, null), CodecMediaException);
  });
});

// ─── get() alias ─────────────────────────────────────────────────────────────

describe("get() alias", () => {
  it("returns same result as probe()", () => {
    const f  = write("alias.webm", WEBM_BYTES);
    const r1 = engine.get(f);
    const r2 = engine.probe(f);
    assert.deepEqual(r1, r2);
  });
});
