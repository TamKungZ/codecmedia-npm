import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class AiffParser {
  static parse(data) {
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data ?? []);
    if (!this.isLikelyAiff(bytes)) {
      throw new CodecMediaException("Not an AIFF file");
    }

    let offset = 12;
    let channels = null;
    let bitsPerSample = null;
    let sampleRate = null;
    let frameCount = null;

    while (offset + 8 <= bytes.length) {
      const chunkId = this.#readAscii(bytes, offset, 4);
      const chunkSize = this.#readBeInt(bytes, offset + 4);
      if (chunkSize < 0) {
        throw new CodecMediaException(`Invalid AIFF chunk size: ${chunkSize}`);
      }

      const chunkDataStart = offset + 8;
      if (chunkDataStart + chunkSize > bytes.length) {
        throw new CodecMediaException(`AIFF chunk exceeds file bounds: ${chunkId}`);
      }

      if (chunkId === "COMM") {
        if (chunkSize < 18) {
          throw new CodecMediaException("AIFF COMM chunk too small");
        }
        channels = this.#readBeShort(bytes, chunkDataStart);
        frameCount = this.#readBeUInt32(bytes, chunkDataStart + 2);
        bitsPerSample = this.#readBeShort(bytes, chunkDataStart + 6);
        sampleRate = this.#decodeExtended80ToIntHz(bytes, chunkDataStart + 8);
      }

      const padded = chunkSize % 2 === 0 ? chunkSize : chunkSize + 1;
      offset = chunkDataStart + padded;
    }

    if (channels == null || bitsPerSample == null || sampleRate == null || frameCount == null) {
      throw new CodecMediaException("AIFF missing required COMM chunk fields");
    }
    if (channels <= 0 || bitsPerSample <= 0 || sampleRate <= 0 || frameCount < 0) {
      throw new CodecMediaException("Invalid AIFF format values");
    }

    const durationMillis = Math.floor((frameCount * 1000) / sampleRate);
    const byteRate = Math.floor((sampleRate * channels * bitsPerSample) / 8);
    const bitrateKbps = Math.floor((byteRate * 8) / 1000);

    return {
      durationMillis,
      bitrateKbps,
      sampleRate,
      channels,
      bitrateMode: "CBR",
    };
  }

  static isLikelyAiff(bytes) {
    if (!bytes || bytes.length < 12) return false;
    const form = bytes[0] === 0x46 && bytes[1] === 0x4f && bytes[2] === 0x52 && bytes[3] === 0x4d;
    const aiff = bytes[8] === 0x41 && bytes[9] === 0x49 && bytes[10] === 0x46 && (bytes[11] === 0x46 || bytes[11] === 0x43);
    return form && aiff;
  }

  static #decodeExtended80ToIntHz(bytes, offset) {
    if (offset + 10 > bytes.length) {
      throw new CodecMediaException("Unexpected end of AIFF data");
    }

    const exp = ((bytes[offset] & 0x7f) << 8) | (bytes[offset + 1] & 0xff);
    let mantissa = 0n;
    for (let i = 0; i < 8; i++) {
      mantissa = (mantissa << 8n) | BigInt(bytes[offset + 2 + i] & 0xff);
    }

    if (exp === 0 || mantissa === 0n) {
      return 0;
    }

    const shift = exp - 16383 - 63;
    let value;
    if (shift >= 0) {
      const safeShift = BigInt(Math.min(shift, 30));
      value = mantissa << safeShift;
    } else {
      const safeShift = BigInt(Math.min(-shift, 63));
      value = mantissa >> safeShift;
    }

    if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new CodecMediaException("Unsupported AIFF sample rate encoding");
    }
    return Number(value);
  }

  static #readAscii(bytes, offset, len) {
    if (offset + len > bytes.length) {
      throw new CodecMediaException("Unexpected end of AIFF data");
    }
    return bytes.toString("ascii", offset, offset + len);
  }

  static #readBeShort(bytes, offset) {
    if (offset + 2 > bytes.length) {
      throw new CodecMediaException("Unexpected end of AIFF data");
    }
    return ((bytes[offset] & 0xff) << 8) | (bytes[offset + 1] & 0xff);
  }

  static #readBeInt(bytes, offset) {
    if (offset + 4 > bytes.length) {
      throw new CodecMediaException("Unexpected end of AIFF data");
    }
    return ((bytes[offset] & 0xff) << 24)
      | ((bytes[offset + 1] & 0xff) << 16)
      | ((bytes[offset + 2] & 0xff) << 8)
      | (bytes[offset + 3] & 0xff);
  }

  static #readBeUInt32(bytes, offset) {
    return this.#readBeInt(bytes, offset) >>> 0;
  }
}

