import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class Mp3Parser {
  static parse(data) {
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data ?? []);
    if (bytes.length < 4) {
      throw new CodecMediaException("Invalid MP3 data: too small");
    }

    const audioStart = this.#skipId3v2(bytes);
    const firstFrameOffset = this.#findFrameOffset(bytes, audioStart);
    if (firstFrameOffset < 0) {
      throw new CodecMediaException("No valid MP3 frame found");
    }

    const firstFrame = this.#parseFrameHeader(bytes, firstFrameOffset);
    if (!firstFrame) {
      throw new CodecMediaException("Invalid first MP3 frame");
    }

    const xingFrames = this.#readXingFrameCountIfPresent(bytes, firstFrameOffset, firstFrame);
    const vbriFrames = this.#readVbriFrameCountIfPresent(bytes, firstFrameOffset, firstFrame);

    const stats = this.#scanFrames(bytes, firstFrameOffset, firstFrame.sampleRate, firstFrame.samplesPerFrame);
    const durationMillis = this.#estimateDurationMillis(stats, xingFrames, vbriFrames);
    const avgBitrate = this.#estimateAverageBitrateKbps(stats, durationMillis);
    const bitrateMode = this.#detectBitrateMode(stats, xingFrames, vbriFrames);

    return {
      codec: "mp3",
      sampleRate: firstFrame.sampleRate,
      channels: firstFrame.channels,
      bitrateKbps: avgBitrate > 0 ? avgBitrate : firstFrame.bitrateKbps,
      bitrateMode,
      durationMillis,
    };
  }

  static isLikelyMp3(bytes) {
    if (!bytes || bytes.length < 2) return false;
    if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
    return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  }

  static #BITRATE_MPEG1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  static #BITRATE_MPEG2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
  static #SAMPLE_RATE_MPEG1 = [44100, 48000, 32000, 0];
  static #SAMPLE_RATE_MPEG2 = [22050, 24000, 16000, 0];
  static #SAMPLE_RATE_MPEG25 = [11025, 12000, 8000, 0];

  static #skipId3v2(bytes) {
    if (bytes.length < 10) return 0;
    if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0;
    const flags = bytes[5] & 0xff;
    const size = this.#synchsafeToInt(bytes[6] & 0xff, bytes[7] & 0xff, bytes[8] & 0xff, bytes[9] & 0xff);
    const total = 10 + size + ((flags & 0x10) !== 0 ? 10 : 0);
    return Math.min(total, bytes.length);
  }

  static #synchsafeToInt(b0, b1, b2, b3) {
    return ((b0 & 0x7f) << 21) | ((b1 & 0x7f) << 14) | ((b2 & 0x7f) << 7) | (b3 & 0x7f);
  }

  static #findFrameOffset(bytes, start) {
    for (let i = Math.max(0, start); i + 4 <= bytes.length; i++) {
      const h = this.#parseFrameHeader(bytes, i);
      if (!h) continue;
      const next = i + h.frameLength;
      if (next + 4 <= bytes.length && this.#parseFrameHeader(bytes, next)) {
        return i;
      }
    }
    return -1;
  }

  static #parseFrameHeader(bytes, offset) {
    if (offset < 0 || offset + 4 > bytes.length) return null;
    const h = ((bytes[offset] & 0xff) << 24)
      | ((bytes[offset + 1] & 0xff) << 16)
      | ((bytes[offset + 2] & 0xff) << 8)
      | (bytes[offset + 3] & 0xff);

    if (((h & 0xffe00000) >>> 0) !== 0xffe00000) return null;

    const versionBits = (h >>> 19) & 0b11;
    const layerBits = (h >>> 17) & 0b11;
    const bitrateIndex = (h >>> 12) & 0b1111;
    const sampleRateIndex = (h >>> 10) & 0b11;
    const padding = (h >>> 9) & 0b1;
    const channelMode = (h >>> 6) & 0b11;

    if (versionBits === 0b01 || layerBits !== 0b01 || bitrateIndex === 0 || bitrateIndex === 0b1111 || sampleRateIndex === 0b11) {
      return null;
    }

    const sampleRate = versionBits === 0b11
      ? this.#SAMPLE_RATE_MPEG1[sampleRateIndex]
      : versionBits === 0b10
        ? this.#SAMPLE_RATE_MPEG2[sampleRateIndex]
        : this.#SAMPLE_RATE_MPEG25[sampleRateIndex];
    if (!sampleRate) return null;

    const bitrateKbps = (versionBits === 0b11 ? this.#BITRATE_MPEG1_L3 : this.#BITRATE_MPEG2_L3)[bitrateIndex];
    if (bitrateKbps <= 0) return null;

    const samplesPerFrame = versionBits === 0b11 ? 1152 : 576;
    const frameLength = versionBits === 0b11
      ? Math.floor((144000 * bitrateKbps) / sampleRate) + padding
      : Math.floor((72000 * bitrateKbps) / sampleRate) + padding;
    if (frameLength < 4) return null;

    const channels = channelMode === 0b11 ? 1 : 2;
    return { versionBits, layerBits, bitrateKbps, sampleRate, channels, frameLength, samplesPerFrame };
  }

  static #readXingFrameCountIfPresent(bytes, frameOffset, header) {
    const sideInfoSize = header.versionBits === 0b11
      ? (header.channels === 1 ? 17 : 32)
      : (header.channels === 1 ? 9 : 17);
    const xingOffset = frameOffset + 4 + sideInfoSize;
    if (xingOffset + 16 > bytes.length) return -1;
    const tag = this.#ascii(bytes, xingOffset, 4);
    if (tag !== "Xing" && tag !== "Info") return -1;
    const flags = this.#readIntBE(bytes, xingOffset + 4);
    if ((flags & 0x1) === 0 || xingOffset + 12 > bytes.length) return -1;
    return this.#readIntBE(bytes, xingOffset + 8);
  }

  static #readVbriFrameCountIfPresent(bytes, frameOffset) {
    const vbriOffset = frameOffset + 4 + 32;
    if (vbriOffset + 18 > bytes.length) return -1;
    if (this.#ascii(bytes, vbriOffset, 4) !== "VBRI") return -1;
    return this.#readIntBE(bytes, vbriOffset + 14);
  }

  static #scanFrames(bytes, startOffset, sampleRate, samplesPerFrame) {
    let offset = startOffset;
    let totalBits = 0;
    let totalSamples = 0;
    let frames = 0;
    const bitrates = new Set();

    while (offset + 4 <= bytes.length) {
      const h = this.#parseFrameHeader(bytes, offset);
      if (!h || offset + h.frameLength > bytes.length) break;
      frames++;
      bitrates.add(h.bitrateKbps);
      totalBits += h.frameLength * 8;
      totalSamples += h.samplesPerFrame;
      offset += h.frameLength;
    }

    return { frames, bitrates, totalBits, totalSamples, sampleRate, samplesPerFrame };
  }

  static #estimateDurationMillis(stats, xingFrames, vbriFrames) {
    if (stats.frames <= 0) return 0;
    if (stats.totalSamples > 0 && stats.sampleRate > 0) {
      return Math.floor((stats.totalSamples * 1000) / stats.sampleRate);
    }
    const knownFrames = xingFrames > 0 ? xingFrames : vbriFrames;
    if (knownFrames > 0 && stats.samplesPerFrame > 0 && stats.sampleRate > 0) {
      return Math.floor((knownFrames * stats.samplesPerFrame * 1000) / stats.sampleRate);
    }
    return 0;
  }

  static #estimateAverageBitrateKbps(stats, durationMillis) {
    if (durationMillis <= 0 || stats.totalBits <= 0) return 0;
    return Math.floor((stats.totalBits * 1000) / durationMillis / 1000);
  }

  static #detectBitrateMode(stats, xingFrames, vbriFrames) {
    if (stats.frames <= 1) return "UNKNOWN";
    const hasVbrTag = xingFrames > 0 || vbriFrames > 0;
    const oneBitrate = stats.bitrates.size <= 1;
    if (hasVbrTag && oneBitrate) return "CVBR";
    if (hasVbrTag || !oneBitrate) return "VBR";
    return "CBR";
  }

  static #readIntBE(bytes, offset) {
    if (offset + 4 > bytes.length) return -1;
    return ((bytes[offset] & 0xff) << 24)
      | ((bytes[offset + 1] & 0xff) << 16)
      | ((bytes[offset + 2] & 0xff) << 8)
      | (bytes[offset + 3] & 0xff);
  }

  static #ascii(bytes, offset, len) {
    if (offset < 0 || offset + len > bytes.length) return "";
    return Buffer.from(bytes.subarray(offset, offset + len)).toString("ascii");
  }
}

