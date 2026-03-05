import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class WavParser {
  static parse(data) {
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data ?? []);
    if (!this.isLikelyWav(bytes)) {
      throw new CodecMediaException("Not a WAV/RIFF file");
    }

    let offset = 12;
    let channels = null;
    let sampleRate = null;
    let bitsPerSample = null;
    let dataSize = null;

    while (offset + 8 <= bytes.length) {
      const chunkId = bytes.toString("ascii", offset, offset + 4);
      const chunkSize = this.#readLeInt(bytes, offset + 4);
      if (chunkSize < 0) {
        throw new CodecMediaException(`Invalid WAV chunk size: ${chunkSize}`);
      }

      const chunkDataStart = offset + 8;
      if (chunkDataStart + chunkSize > bytes.length) {
        throw new CodecMediaException(`WAV chunk exceeds file bounds: ${chunkId}`);
      }

      if (chunkId === "fmt ") {
        if (chunkSize < 16) {
          throw new CodecMediaException("WAV fmt chunk is too small");
        }
        channels = this.#readLeShort(bytes, chunkDataStart + 2);
        sampleRate = this.#readLeInt(bytes, chunkDataStart + 4);
        bitsPerSample = this.#readLeShort(bytes, chunkDataStart + 14);
      } else if (chunkId === "data") {
        dataSize = chunkSize;
      }

      const padded = chunkSize % 2 === 0 ? chunkSize : chunkSize + 1;
      offset = chunkDataStart + padded;
    }

    if (channels == null || sampleRate == null || bitsPerSample == null || dataSize == null) {
      throw new CodecMediaException("WAV is missing required fmt/data chunks");
    }
    if (channels <= 0 || sampleRate <= 0 || bitsPerSample <= 0) {
      throw new CodecMediaException("Invalid WAV format values");
    }

    const byteRate = Math.floor((sampleRate * channels * bitsPerSample) / 8);
    if (byteRate <= 0) {
      throw new CodecMediaException("Invalid WAV byte rate");
    }

    const durationMillis = Math.floor((dataSize * 1000) / byteRate);
    const bitrateKbps = Math.floor((byteRate * 8) / 1000);

    return {
      durationMillis,
      bitrateKbps,
      sampleRate,
      channels,
      bitrateMode: "CBR",
    };
  }

  static isLikelyWav(bytes) {
    return (
      !!bytes &&
      bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45
    );
  }

  static #readLeShort(bytes, offset) {
    if (offset + 2 > bytes.length) {
      throw new CodecMediaException("Unexpected end of WAV data");
    }
    return (bytes[offset] & 0xff) | ((bytes[offset + 1] & 0xff) << 8);
  }

  static #readLeInt(bytes, offset) {
    if (offset + 4 > bytes.length) {
      throw new CodecMediaException("Unexpected end of WAV data");
    }
    return (bytes[offset] & 0xff)
      | ((bytes[offset + 1] & 0xff) << 8)
      | ((bytes[offset + 2] & 0xff) << 16)
      | ((bytes[offset + 3] & 0xff) << 24);
  }
}

