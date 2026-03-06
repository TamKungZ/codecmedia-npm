import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class OggParser {
  static parse(data) {
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data ?? []);
    if (bytes.length < 27) {
      throw new CodecMediaException("Invalid OGG data: too small");
    }

    const firstPage = this.#parsePageHeader(bytes, 0);
    if (!firstPage) {
      throw new CodecMediaException("Invalid OGG stream: missing OggS header");
    }

    const identOffset = firstPage.headerSize;
    const firstPayloadSize = firstPage.payloadSize;
    if (identOffset + firstPayloadSize > bytes.length || firstPayloadSize <= 0) {
      throw new CodecMediaException("Invalid OGG stream: incomplete first packet payload");
    }

    const ident = this.#parseIdentificationPacket(bytes, identOffset, firstPayloadSize);

    let payloadBits = 0;
    let pageCount = 0;
    let maxGranule = 0;
    let offset = 0;

    while (offset + 27 <= bytes.length) {
      const page = this.#parsePageHeader(bytes, offset);
      if (!page) break;
      payloadBits += page.payloadSize * 8;
      pageCount += 1;
      if (page.granulePosition > maxGranule) {
        maxGranule = page.granulePosition;
      }
      offset += page.totalPageSize;
    }

    const granuleRate = ident.granuleRate > 0 ? ident.granuleRate : ident.sampleRate;
    const durationMillis = granuleRate > 0 && maxGranule > 0
      ? Math.floor((maxGranule * 1000) / granuleRate)
      : 0;

    const avgBitrate = durationMillis > 0
      ? Math.floor((payloadBits * 1000) / durationMillis / 1000)
      : 0;

    const nominalKbps = ident.nominalBitrate > 0 ? Math.floor(ident.nominalBitrate / 1000) : 0;
    const bitrateKbps = avgBitrate > 0 ? avgBitrate : nominalKbps;

    const bitrateMode = ident.codec === "vorbis"
      ? (ident.nominalBitrate > 0 || pageCount > 2 ? "VBR" : "UNKNOWN")
      : ident.codec === "opus"
        ? "VBR"
        : "UNKNOWN";

    return {
      codec: ident.codec,
      sampleRate: ident.sampleRate,
      channels: ident.channels,
      bitrateKbps,
      bitrateMode,
      durationMillis,
    };
  }

  static isLikelyOgg(bytes) {
    return !!bytes && bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53;
  }

  static #OPUS_GRANULE_RATE = 48_000;

  static #parseIdentificationPacket(bytes, identOffset, payloadSize) {
    if (this.#isVorbisIdentification(bytes, identOffset, payloadSize)) {
      if (payloadSize < 30) {
        throw new CodecMediaException("Invalid OGG Vorbis stream: incomplete identification packet");
      }
      const channels = bytes[identOffset + 11] & 0xff;
      const sampleRate = this.#readU32LE(bytes, identOffset + 12);
      const nominalBitrate = this.#readU32LE(bytes, identOffset + 20);
      return {
        codec: "vorbis",
        sampleRate,
        channels,
        nominalBitrate,
        granuleRate: sampleRate,
      };
    }

    if (this.#isOpusIdentification(bytes, identOffset, payloadSize)) {
      if (payloadSize < 19) {
        throw new CodecMediaException("Invalid OGG Opus stream: incomplete OpusHead packet");
      }
      const channels = bytes[identOffset + 9] & 0xff;
      const inputSampleRate = this.#readU32LE(bytes, identOffset + 12);
      const sampleRate = inputSampleRate > 0 ? inputSampleRate : this.#OPUS_GRANULE_RATE;
      return {
        codec: "opus",
        sampleRate,
        channels,
        nominalBitrate: 0,
        granuleRate: this.#OPUS_GRANULE_RATE,
      };
    }

    throw new CodecMediaException("Unsupported OGG codec: currently Vorbis and Opus are parsed");
  }

  static #isVorbisIdentification(bytes, offset, payloadSize) {
    return payloadSize >= 7
      && bytes[offset] === 0x01
      && bytes[offset + 1] === 0x76
      && bytes[offset + 2] === 0x6f
      && bytes[offset + 3] === 0x72
      && bytes[offset + 4] === 0x62
      && bytes[offset + 5] === 0x69
      && bytes[offset + 6] === 0x73;
  }

  static #isOpusIdentification(bytes, offset, payloadSize) {
    return payloadSize >= 8
      && bytes[offset] === 0x4f
      && bytes[offset + 1] === 0x70
      && bytes[offset + 2] === 0x75
      && bytes[offset + 3] === 0x73
      && bytes[offset + 4] === 0x48
      && bytes[offset + 5] === 0x65
      && bytes[offset + 6] === 0x61
      && bytes[offset + 7] === 0x64;
  }

  static #parsePageHeader(bytes, offset) {
    if (offset < 0 || offset + 27 > bytes.length) return null;
    if (bytes[offset] !== 0x4f || bytes[offset + 1] !== 0x67 || bytes[offset + 2] !== 0x67 || bytes[offset + 3] !== 0x53) {
      return null;
    }

    const version = bytes[offset + 4] & 0xff;
    const headerType = bytes[offset + 5] & 0xff;
    const granulePosition = this.#readU64LE(bytes, offset + 6);
    const serial = this.#readU32LE(bytes, offset + 14);
    const sequence = this.#readU32LE(bytes, offset + 18);
    const segmentCount = bytes[offset + 26] & 0xff;

    if (offset + 27 + segmentCount > bytes.length) return null;

    let payloadSize = 0;
    for (let i = 0; i < segmentCount; i++) {
      payloadSize += bytes[offset + 27 + i] & 0xff;
    }

    const headerSize = 27 + segmentCount;
    const totalPageSize = headerSize + payloadSize;
    if (offset + totalPageSize > bytes.length) return null;

    return {
      version,
      headerType,
      granulePosition,
      serial,
      sequence,
      segmentCount,
      payloadSize,
      totalPageSize,
      headerSize,
    };
  }

  static #readU32LE(bytes, offset) {
    if (offset + 4 > bytes.length) {
      throw new CodecMediaException("Unexpected end of OGG data");
    }
    return (bytes[offset] & 0xff)
      | ((bytes[offset + 1] & 0xff) << 8)
      | ((bytes[offset + 2] & 0xff) << 16)
      | ((bytes[offset + 3] & 0xff) << 24);
  }

  static #readU64LE(bytes, offset) {
    if (offset + 8 > bytes.length) {
      throw new CodecMediaException("Unexpected end of OGG data");
    }
    let value = 0n;
    for (let i = 0; i < 8; i++) {
      value |= BigInt(bytes[offset + i] & 0xff) << BigInt(i * 8);
    }
    return Number(value);
  }
}

