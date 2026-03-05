import fs from "node:fs";
import zlib from "node:zlib";
import { CodecMediaException } from "../../../errors/CodecMediaException.js";
import { PngParser } from "./PngParser.js";

/**
 * Minimal zero-dependency PNG codec helper aligned with Java structure.
 *
 * Scope:
 * - decode(): validate PNG and expose parsed probe info + raw bytes
 * - encodeRgb24(): encode RGB24 raster into PNG file
 */
export class PngCodec {
  static decode(input) {
    try {
      const bytes = fs.readFileSync(input);
      const info = PngParser.parse(bytes);
      this.#validateDecodedImage(info, input);
      return {
        width: info.width,
        height: info.height,
        bitDepth: info.bitDepth,
        colorType: info.colorType,
        bytes,
      };
    } catch (err) {
      if (err instanceof CodecMediaException) throw err;
      throw new CodecMediaException(`Failed to decode PNG: ${input}`, err);
    }
  }

  static encodeRgb24(rgb, width, height, output) {
    try {
      if (!Buffer.isBuffer(rgb)) {
        throw new CodecMediaException("PNG encode expects rgb to be a Buffer");
      }
      if (width <= 0 || height <= 0) {
        throw new CodecMediaException("PNG encode requires positive width/height");
      }
      if (rgb.length !== width * height * 3) {
        throw new CodecMediaException("PNG encode rgb buffer size does not match width/height");
      }

      const rowBytes = width * 3;
      const raw = Buffer.alloc((rowBytes + 1) * height);
      let src = 0;
      let dst = 0;
      for (let y = 0; y < height; y++) {
        raw[dst++] = 0;
        rgb.copy(raw, dst, src, src + rowBytes);
        dst += rowBytes;
        src += rowBytes;
      }

      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(width, 0);
      ihdr.writeUInt32BE(height, 4);
      ihdr[8] = 8;
      ihdr[9] = 2;
      ihdr[10] = 0;
      ihdr[11] = 0;
      ihdr[12] = 0;

      const idat = zlib.deflateSync(raw, { level: 6 });
      const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      const file = Buffer.concat([
        signature,
        this.#createChunk("IHDR", ihdr),
        this.#createChunk("IDAT", idat),
        this.#createChunk("IEND", Buffer.alloc(0)),
      ]);
      fs.writeFileSync(output, file);
    } catch (err) {
      if (err instanceof CodecMediaException) throw err;
      throw new CodecMediaException(`Failed to encode PNG: ${output}`, err);
    }
  }

  static #validateDecodedImage(info, input) {
    if (!info || info.width <= 0 || info.height <= 0) {
      throw new CodecMediaException(`Decoded PNG has invalid dimensions: ${input}`);
    }
    if (info.bitDepth == null || info.bitDepth <= 0) {
      throw new CodecMediaException(`Decoded PNG has invalid bit depth: ${input}`);
    }
    const channels = this.#channelsByColorType(info.colorType);
    if (channels <= 0) {
      throw new CodecMediaException(`Decoded PNG has invalid pixel channels: ${input}`);
    }
  }

  static #channelsByColorType(colorType) {
    switch (colorType) {
      case 0: return 1;
      case 2: return 3;
      case 3: return 1;
      case 4: return 2;
      case 6: return 4;
      default: return 0;
    }
  }

  static #createChunk(type, data) {
    const typeBytes = Buffer.from(type, "ascii");
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const crcInput = Buffer.concat([typeBytes, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcInput), 0);
    return Buffer.concat([length, typeBytes, data, crc]);
  }
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
