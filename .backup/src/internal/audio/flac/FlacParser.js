import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class FlacParser {
  static parse(data) {
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data ?? []);
    if (!this.isLikelyFlac(bytes)) {
      throw new CodecMediaException("Not a FLAC file");
    }

    let offset = 4;
    let streamInfoFound = false;
    let sampleRate = 0;
    let channels = 0;
    let bitsPerSample = 0;
    let totalSamples = 0;

    while (offset + 4 <= bytes.length) {
      const header = bytes[offset] & 0xff;
      const last = (header & 0x80) !== 0;
      const blockType = header & 0x7f;
      const length = ((bytes[offset + 1] & 0xff) << 16)
        | ((bytes[offset + 2] & 0xff) << 8)
        | (bytes[offset + 3] & 0xff);
      offset += 4;

      if (length < 0 || offset + length > bytes.length) {
        throw new CodecMediaException("Invalid FLAC metadata block length");
      }

      if (blockType === 0) {
        if (length < 34) {
          throw new CodecMediaException("Invalid FLAC STREAMINFO block");
        }
        const packed = this.#readUInt64BE(bytes, offset + 10);
        sampleRate = Number((packed >> 44n) & 0xfffffn);
        channels = Number(((packed >> 41n) & 0x7n) + 1n);
        bitsPerSample = Number(((packed >> 36n) & 0x1fn) + 1n);
        totalSamples = Number(packed & 0xfffffffffn);
        streamInfoFound = true;
      }

      offset += length;
      if (last) break;
    }

    if (!streamInfoFound || sampleRate <= 0 || channels <= 0 || bitsPerSample <= 0) {
      throw new CodecMediaException("FLAC STREAMINFO is missing or invalid");
    }

    const durationMillis = totalSamples > 0 ? Math.floor((totalSamples * 1000) / sampleRate) : 0;
    const avgBitrateKbps = durationMillis > 0
      ? Math.floor(((bytes.length * 8) * 1000) / durationMillis / 1000)
      : 0;
    const pcmEquivalentKbps = Math.floor((sampleRate * channels * bitsPerSample) / 1000);
    const bitrateKbps = avgBitrateKbps > 0 ? avgBitrateKbps : pcmEquivalentKbps;

    return {
      codec: "flac",
      sampleRate,
      channels,
      bitsPerSample,
      bitrateKbps,
      bitrateMode: "VBR",
      durationMillis,
    };
  }

  static isLikelyFlac(bytes) {
    return !!bytes && bytes.length >= 4 && bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43;
  }

  static #readUInt64BE(bytes, offset) {
    if (offset + 8 > bytes.length) {
      throw new CodecMediaException("Unexpected end of FLAC data");
    }
    let value = 0n;
    for (let i = 0; i < 8; i++) {
      value = (value << 8n) | BigInt(bytes[offset + i] & 0xff);
    }
    return value;
  }
}

