/**
 * WavParser
 * Port + hardening of me.tamkungz.codecmedia.internal.audio.wav.WavParser
 */
import { CodecMediaException } from "../../../CodecMediaException.js";
import { WavProbeInfo } from "./WavProbeInfo.js";

const RIFF = "RIFF";
const RF64 = "RF64";
const RIFX = "RIFX";
const WAVE = "WAVE";

export class WavParser {
  /**
   * @param {Buffer | Uint8Array} bytes
   * @returns {import("./WavProbeInfo.js").WavProbeInfo}
   */
  static parse(bytes) {
    if (!bytes || bytes.length < 12) {
      throw new CodecMediaException("Invalid WAV data: too small");
    }

    const riffId = ascii(bytes, 0, 4);
    const waveId = ascii(bytes, 8, 4);
    if (waveId !== WAVE || (riffId !== RIFF && riffId !== RF64 && riffId !== RIFX)) {
      throw new CodecMediaException("Not a WAV/RIFF file");
    }

    const littleEndian = riffId !== RIFX;

    let offset = 12;
    let channels = null;
    let sampleRate = null;
    let bitsPerSample = null;
    let blockAlign = null;
    let byteRate = null;
    let dataBytes = 0n;
    let sawData = false;

    while (offset + 8 <= bytes.length) {
      const chunkId = ascii(bytes, offset, 4);
      const chunkSizeU32 = readU32(bytes, offset + 4, littleEndian);
      const chunkSize = BigInt(chunkSizeU32);
      const chunkDataStart = offset + 8;

      if (chunkDataStart > bytes.length) {
        throw new CodecMediaException("Invalid WAV chunk layout");
      }

      const remaining = BigInt(bytes.length - chunkDataStart);
      if (chunkSize > remaining) {
        throw new CodecMediaException(`WAV chunk exceeds file bounds: ${chunkId}`);
      }

      if (chunkId === "fmt ") {
        if (chunkSizeU32 < 16) {
          throw new CodecMediaException("WAV fmt chunk is too small");
        }

        const formatTag = readU16(bytes, chunkDataStart + 0, littleEndian);
        channels = readU16(bytes, chunkDataStart + 2, littleEndian);
        sampleRate = readU32(bytes, chunkDataStart + 4, littleEndian);
        byteRate = readU32(bytes, chunkDataStart + 8, littleEndian);
        blockAlign = readU16(bytes, chunkDataStart + 12, littleEndian);
        bitsPerSample = readU16(bytes, chunkDataStart + 14, littleEndian);

        // WAVE_FORMAT_EXTENSIBLE stores the valid bits/sample at +18 (if present),
        // and we can keep container bitsPerSample from +14 for stream math.
        // formatTag accepted broadly (PCM/IEEE float/alaw/mulaw/extensible/etc.)
        if (formatTag === 0 || channels <= 0 || sampleRate <= 0) {
          throw new CodecMediaException("Invalid WAV format values");
        }
      } else if (chunkId === "data") {
        sawData = true;
        dataBytes += chunkSize;
      }

      const padded = Number(chunkSize + (chunkSize & 1n));
      offset = chunkDataStart + padded;
    }

    if (!sawData) {
      throw new CodecMediaException("WAV is missing data chunk");
    }
    if (channels == null || sampleRate == null || bitsPerSample == null) {
      throw new CodecMediaException("WAV is missing required fmt chunk");
    }
    if (channels <= 0 || sampleRate <= 0 || bitsPerSample <= 0) {
      throw new CodecMediaException("Invalid WAV format values");
    }

    let effectiveByteRate = byteRate && byteRate > 0 ? BigInt(byteRate) : 0n;
    if (effectiveByteRate <= 0n && blockAlign && blockAlign > 0) {
      effectiveByteRate = BigInt(sampleRate) * BigInt(blockAlign);
    }
    if (effectiveByteRate <= 0n) {
      effectiveByteRate = (BigInt(sampleRate) * BigInt(channels) * BigInt(bitsPerSample)) / 8n;
    }
    if (effectiveByteRate <= 0n) {
      throw new CodecMediaException("Invalid WAV byte rate");
    }

    const durationMillis = Number((dataBytes * 1000n) / effectiveByteRate);
    const bitrateKbps = Number((effectiveByteRate * 8n) / 1000n);

    return WavProbeInfo({
      codec: "pcm",
      durationMillis,
      bitrateKbps,
      sampleRate,
      channels,
      bitsPerSample,
      bitrateMode: "CBR",
    });
  }

  /**
   * @param {Buffer | Uint8Array} bytes
   * @returns {boolean}
   */
  static isLikelyWav(bytes) {
    if (!bytes || bytes.length < 12) return false;
    const riffId = ascii(bytes, 0, 4);
    if (riffId !== RIFF && riffId !== RF64 && riffId !== RIFX) return false;
    return ascii(bytes, 8, 4) === WAVE;
  }
}

function ascii(bytes, offset, len) {
  if (offset < 0 || offset + len > bytes.length) return "";
  return Buffer.from(bytes).subarray(offset, offset + len).toString("ascii");
}

function readU16(bytes, offset, littleEndian) {
  if (offset < 0 || offset + 2 > bytes.length) {
    throw new CodecMediaException("Unexpected end of WAV data");
  }
  return littleEndian
    ? ((bytes[offset] & 0xff) | ((bytes[offset + 1] & 0xff) << 8))
    : (((bytes[offset] & 0xff) << 8) | (bytes[offset + 1] & 0xff));
}

function readU32(bytes, offset, littleEndian) {
  if (offset < 0 || offset + 4 > bytes.length) {
    throw new CodecMediaException("Unexpected end of WAV data");
  }
  const b0 = bytes[offset] & 0xff;
  const b1 = bytes[offset + 1] & 0xff;
  const b2 = bytes[offset + 2] & 0xff;
  const b3 = bytes[offset + 3] & 0xff;

  return littleEndian
    ? (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0
    : (b3 | (b2 << 8) | (b1 << 16) | (b0 << 24)) >>> 0;
}

