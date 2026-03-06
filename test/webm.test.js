import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WebmParser } from "../src/internal/video/webm/WebmParser.js";
import { WebmCodec } from "../src/internal/video/webm/WebmCodec.js";
import { CodecMediaException } from "../src/CodecMediaException.js";

// ─── Helpers: build minimal valid WebM bytes ──────────────────────────────────

/** Write EBML VINT size (1-byte for values < 127) */
function vint1(value) {
  return Buffer.from([0x80 | value]);
}

/** Write big-endian uint of given byteLen */
function uintBE(value, byteLen) {
  const b = Buffer.alloc(byteLen);
  let v = BigInt(value);
  for (let i = byteLen - 1; i >= 0; i--) {
    b[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return b;
}

/** EBML element: id bytes + vint1 size + payload */
function elem(idBytes, payload) {
  return Buffer.concat([idBytes, vint1(payload.length), payload]);
}

/**
 * Build a minimal but spec-compliant WebM buffer.
 * Structure: EBML header → Segment → Info + Tracks
 */
function buildWebm({
  videoCodec = null,
  audioCodec = null,
  width = null,
  height = null,
  sampleRate = null,
  channels = null,
  durationSec = null,
} = {}) {

  // ── EBML header ───────────────────────────────────────────────────────────
  const doctype = Buffer.from("webm", "ascii");
  const ebmlPayload = Buffer.concat([
    elem(Buffer.from([0x42, 0x82]), doctype),           // DocType = "webm"
    elem(Buffer.from([0x42, 0x87]), Buffer.from([0x04])), // DocTypeVersion = 4
    elem(Buffer.from([0x42, 0x85]), Buffer.from([0x02])), // DocTypeReadVersion = 2
  ]);
  const ebmlHeader = Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
    vint1(ebmlPayload.length),
    ebmlPayload,
  ]);

  // ── Info element (TimecodeScale + optional Duration) ──────────────────────
  const infoParts = [];
  // TimecodeScale (0x2AD7B1) = 1000000
  infoParts.push(elem(Buffer.from([0x2a, 0xd7, 0xb1]), uintBE(1_000_000, 4)));
  if (durationSec != null) {
    const buf = Buffer.alloc(4);
    buf.writeFloatBE(durationSec, 0);
    infoParts.push(elem(Buffer.from([0x44, 0x89]), buf)); // Duration
  }
  const infoPayload = Buffer.concat(infoParts);
  const infoElem = elem(Buffer.from([0x15, 0x49, 0xa9, 0x66]), infoPayload); // Info

  // ── Tracks element ────────────────────────────────────────────────────────
  const trackEntries = [];

  if (videoCodec != null || width != null || height != null) {
    const trackParts = [];
    trackParts.push(elem(Buffer.from([0x83]), Buffer.from([0x01]))); // TrackType = video
    if (videoCodec) {
      trackParts.push(elem(Buffer.from([0x86]), Buffer.from(videoCodec, "ascii"))); // CodecID
    }
    // Video sub-container (0xE0)
    const videoParts = [];
    if (width  != null) videoParts.push(elem(Buffer.from([0xb0]), uintBE(width, 2)));
    if (height != null) videoParts.push(elem(Buffer.from([0xba]), uintBE(height, 2)));
    if (videoParts.length > 0) {
      trackParts.push(elem(Buffer.from([0xe0]), Buffer.concat(videoParts)));
    }
    trackEntries.push(elem(Buffer.from([0xae]), Buffer.concat(trackParts)));
  }

  if (audioCodec != null || sampleRate != null || channels != null) {
    const trackParts = [];
    trackParts.push(elem(Buffer.from([0x83]), Buffer.from([0x02]))); // TrackType = audio
    if (audioCodec) {
      trackParts.push(elem(Buffer.from([0x86]), Buffer.from(audioCodec, "ascii"))); // CodecID
    }
    // Audio sub-container (0xE1)
    const audioParts = [];
    if (channels != null) audioParts.push(elem(Buffer.from([0x9f]), Buffer.from([channels])));
    if (sampleRate != null) {
      const fb = Buffer.alloc(4);
      fb.writeFloatBE(sampleRate, 0);
      audioParts.push(elem(Buffer.from([0xb5]), fb));
    }
    if (audioParts.length > 0) {
      trackParts.push(elem(Buffer.from([0xe1]), Buffer.concat(audioParts)));
    }
    trackEntries.push(elem(Buffer.from([0xae]), Buffer.concat(trackParts)));
  }

  const tracksPayload = Buffer.concat(trackEntries);
  const tracksElem = elem(Buffer.from([0x16, 0x54, 0xae, 0x6b]), tracksPayload); // Tracks

  // ── Segment (unknown size) ────────────────────────────────────────────────
  const segmentPayload = Buffer.concat([infoElem, tracksElem]);
  // Use unknown-size VINT for Segment: 0x01 FF FF FF FF FF FF FF
  const segmentSize = Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  const segmentElem = Buffer.concat([
    Buffer.from([0x18, 0x53, 0x80, 0x67]), // Segment ID
    segmentSize,
    segmentPayload,
  ]);

  return Buffer.concat([ebmlHeader, segmentElem, Buffer.alloc(16)]);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("WebmParser.isLikelyWebm", () => {
  it("returns true for valid WebM bytes", () => {
    const buf = buildWebm({ videoCodec: "V_VP9", width: 1280, height: 720 });
    assert.equal(WebmParser.isLikelyWebm(buf), true);
  });

  it("returns false for null", () => {
    assert.equal(WebmParser.isLikelyWebm(null), false);
  });

  it("returns false for too-short buffer", () => {
    assert.equal(WebmParser.isLikelyWebm(Buffer.from([0x1a, 0x45])), false);
  });

  it("returns false when EBML magic is wrong", () => {
    const buf = Buffer.alloc(32, 0x00);
    assert.equal(WebmParser.isLikelyWebm(buf), false);
  });
});

describe("WebmParser.parse — basic structure", () => {
  it("throws on null input", () => {
    assert.throws(() => WebmParser.parse(null), CodecMediaException);
  });

  it("throws on non-EBML header", () => {
    const bad = Buffer.alloc(32, 0xaa);
    assert.throws(() => WebmParser.parse(bad), CodecMediaException);
  });

  it("parses video-only track", () => {
    const buf = buildWebm({ videoCodec: "V_VP9", width: 1920, height: 1080 });
    const info = WebmParser.parse(buf);
    assert.equal(info.width, 1920);
    assert.equal(info.height, 1080);
    assert.equal(info.videoCodec, "V_VP9");
    assert.equal(info.audioCodec, null);
    assert.equal(info.displayAspectRatio, "16:9");
  });

  it("parses audio-only track", () => {
    const buf = buildWebm({ audioCodec: "A_OPUS", sampleRate: 48000, channels: 2 });
    const info = WebmParser.parse(buf);
    assert.equal(info.audioCodec, "A_OPUS");
    assert.equal(info.sampleRate, 48000);
    assert.equal(info.channels, 2);
    assert.equal(info.videoCodec, null);
  });

  it("parses both video + audio tracks", () => {
    const buf = buildWebm({
      videoCodec: "V_VP8", width: 640, height: 360,
      audioCodec: "A_VORBIS", sampleRate: 44100, channels: 2,
    });
    const info = WebmParser.parse(buf);
    assert.equal(info.videoCodec, "V_VP8");
    assert.equal(info.audioCodec, "A_VORBIS");
    assert.equal(info.width, 640);
    assert.equal(info.height, 360);
    assert.equal(info.sampleRate, 44100);
    assert.equal(info.channels, 2);
  });

  it("parses duration when present", () => {
    const buf = buildWebm({ videoCodec: "V_VP9", width: 1280, height: 720, durationSec: 10.5 });
    const info = WebmParser.parse(buf);
    assert.ok(info.durationMillis != null, "durationMillis should be set");
    assert.equal(info.durationMillis, 11);
  });

  it("parses duration with large timecode scale gives larger millis", () => {
    const buf = buildWebm({ videoCodec: "V_VP9", width: 1280, height: 720, durationSec: 10000.0 });
    const info = WebmParser.parse(buf);
    assert.ok(info.durationMillis != null, "durationMillis should be set");
    assert.equal(info.durationMillis, 10000);
  });

  it("sets durationMillis to null when no duration element", () => {
    const buf = buildWebm({ videoCodec: "V_VP9", width: 640, height: 480 });
    const info = WebmParser.parse(buf);
    assert.equal(info.durationMillis, null);
  });

  it("computes displayAspectRatio correctly for 16:9", () => {
    const buf = buildWebm({ videoCodec: "V_VP9", width: 3840, height: 2160 });
    const info = WebmParser.parse(buf);
    assert.equal(info.displayAspectRatio, "16:9");
  });

  it("computes displayAspectRatio for 4:3", () => {
    const buf = buildWebm({ videoCodec: "V_VP9", width: 640, height: 480 });
    const info = WebmParser.parse(buf);
    assert.equal(info.displayAspectRatio, "4:3");
  });

  it("leaves displayAspectRatio null when no video dimensions", () => {
    const buf = buildWebm({ audioCodec: "A_OPUS", sampleRate: 48000, channels: 1 });
    const info = WebmParser.parse(buf);
    assert.equal(info.displayAspectRatio, null);
  });

  it("result is frozen (immutable)", () => {
    const buf = buildWebm({ videoCodec: "V_VP9", width: 1280, height: 720 });
    const info = WebmParser.parse(buf);
    assert.throws(() => { info.width = 999; }, TypeError);
  });
});

describe("WebmCodec.decodeBytes", () => {
  it("decodes valid WebM bytes successfully", () => {
    const buf = buildWebm({ videoCodec: "V_VP9", width: 1280, height: 720 });
    const info = WebmCodec.decodeBytes(buf, "test.webm");
    assert.equal(info.width, 1280);
    assert.equal(info.height, 720);
  });

  it("throws CodecMediaException for empty buffer", () => {
    assert.throws(
      () => WebmCodec.decodeBytes(Buffer.alloc(0), "empty.webm"),
      CodecMediaException
    );
  });

  it("throws CodecMediaException for non-WebM bytes", () => {
    const buf = Buffer.from("this is not a webm file at all!!!");
    assert.throws(
      () => WebmCodec.decodeBytes(buf, "fake.webm"),
      CodecMediaException
    );
  });
});

describe("WebmCodec.encode", () => {
  it("throws on empty data", () => {
    assert.throws(
      () => WebmCodec.encode(Buffer.alloc(0), "/tmp/out.webm"),
      CodecMediaException
    );
  });

  it("throws on null data", () => {
    assert.throws(
      () => WebmCodec.encode(null, "/tmp/out.webm"),
      CodecMediaException
    );
  });

  it("writes file successfully", () => {
    import("node:os").then((os) => {
      import("node:path").then((path) => {
        import("node:fs").then((fs) => {
          const outPath = path.join(os.tmpdir(), "codec_webm_encode_test.webm");
          const data = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02]);
          WebmCodec.encode(data, outPath);
          const read = fs.readFileSync(outPath);
          assert.deepEqual(read, data);
          fs.unlinkSync(outPath);
        });
      });
    });
  });
});