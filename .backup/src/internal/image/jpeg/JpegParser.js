import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class JpegParser {
  static parse(bytes) {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
    if (!this.isLikelyJpeg(buffer)) {
      throw new CodecMediaException("Not a JPEG file");
    }

    let pos = 2;
    while (pos + 4 <= buffer.length) {
      if ((buffer[pos] & 0xff) !== 0xff) {
        throw new CodecMediaException("Invalid JPEG marker alignment");
      }

      const marker = buffer[pos + 1] & 0xff;
      pos += 2;

      if (marker === 0xd9 || marker === 0xda) {
        break;
      }

      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        continue;
      }

      if (pos + 2 > buffer.length) {
        throw new CodecMediaException("Unexpected end of JPEG while reading segment length");
      }

      const segmentLength = this.#readBeShort(buffer, pos);
      if (segmentLength < 2) {
        throw new CodecMediaException(`Invalid JPEG segment length: ${segmentLength}`);
      }

      const segmentDataStart = pos + 2;
      const segmentDataLength = segmentLength - 2;
      const nextPos = segmentDataStart + segmentDataLength;
      if (nextPos > buffer.length) {
        throw new CodecMediaException("JPEG segment exceeds file bounds");
      }

      if (this.#isSofMarker(marker)) {
        if (segmentDataLength < 6) {
          throw new CodecMediaException("Invalid SOF segment length");
        }

        const bitsPerSample = buffer[segmentDataStart] & 0xff;
        const height = this.#readBeShort(buffer, segmentDataStart + 1);
        const width = this.#readBeShort(buffer, segmentDataStart + 3);
        const channels = buffer[segmentDataStart + 5] & 0xff;

        if (width <= 0 || height <= 0 || channels <= 0) {
          throw new CodecMediaException("JPEG has invalid dimensions/components");
        }

        return { width, height, bitsPerSample, channels };
      }

      pos = nextPos;
    }

    throw new CodecMediaException("JPEG SOF segment not found");
  }

  static isLikelyJpeg(bytes) {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
    return !!buffer
      && buffer.length >= 4
      && (buffer[0] & 0xff) === 0xff
      && (buffer[1] & 0xff) === 0xd8
      && (buffer[2] & 0xff) === 0xff;
  }

  static #readBeShort(bytes, offset) {
    if (offset + 2 > bytes.length) {
      throw new CodecMediaException("Unexpected end of JPEG data");
    }
    return ((bytes[offset] & 0xff) << 8) | (bytes[offset + 1] & 0xff);
  }

  static #isSofMarker(marker) {
    return marker === 0xc0 || marker === 0xc1 || marker === 0xc2
      || marker === 0xc3 || marker === 0xc5 || marker === 0xc6
      || marker === 0xc7 || marker === 0xc9 || marker === 0xca
      || marker === 0xcb || marker === 0xcd || marker === 0xce
      || marker === 0xcf;
  }
}

