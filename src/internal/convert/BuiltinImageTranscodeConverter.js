import fs from "node:fs";
import path from "node:path";
import { CodecMediaException } from "../../errors/CodecMediaException.js";
import { PngCodec } from "../image/png/PngCodec.js";

const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10,
  17, 24, 32, 25, 18, 11, 4, 5,
  12, 19, 26, 33, 40, 48, 41, 34,
  27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36,
  29, 22, 15, 23, 30, 37, 44, 51,
  58, 59, 52, 45, 38, 31, 39, 46,
  53, 60, 61, 54, 47, 55, 62, 63,
];

const COS_TABLE = Array.from({ length: 8 }, (_, x) =>
  Array.from({ length: 8 }, (_, u) => Math.cos(((2 * x + 1) * u * Math.PI) / 16))
);

const C = [
  1 / Math.sqrt(2),
  1,
  1,
  1,
  1,
  1,
  1,
  1,
];

/**
 * Zero-dependency built-in image transcoder.
 *
 * Current built-in scope intentionally focuses on the practical path needed by
 * this port: JPEG/JPG -> PNG/BMP.
 */
export class BuiltinImageTranscodeConverter {
  convert(request) {
    const source = this.#normalize(request.sourceExtension);
    const target = this.#normalize(request.requestedExtension);

    if (!(source === "jpg" || source === "jpeg")) {
      throw new CodecMediaException(
        `image->image transcoding currently supports source jpg/jpeg only in zero-dependency core (got: ${source || "<unknown>"})`
      );
    }

    if (!(target === "png" || target === "bmp")) {
      throw new CodecMediaException(
        `image->image transcoding currently supports target png/bmp only in zero-dependency core (got: ${target || "<unknown>"})`
      );
    }

    const output = request.output;
    try {
      const parent = path.dirname(output);
      if (parent) {
        fs.mkdirSync(parent, { recursive: true });
      }
      if (fs.existsSync(output) && !request.options?.overwrite) {
        throw new CodecMediaException(`Output already exists and overwrite is disabled: ${output}`);
      }

      const sourceBytes = fs.readFileSync(request.input);
      const decoded = decodeBaselineJpegToRgb(sourceBytes);

      if (target === "png") {
        PngCodec.encodeRgb24(decoded.rgb, decoded.width, decoded.height, output);
      } else {
        writeBmp24(decoded.width, decoded.height, decoded.rgb, output);
      }

      return {
        outputFile: output,
        format: target,
        reencoded: true,
      };
    } catch (err) {
      if (err instanceof CodecMediaException) throw err;
      throw new CodecMediaException(`Failed image transcode: ${request.input} -> ${output}`, err);
    }
  }

  #normalize(value) {
    const normalized = String(value ?? "").trim().toLowerCase();
    return normalized.startsWith(".") ? normalized.slice(1) : normalized;
  }
}

function decodeBaselineJpegToRgb(bytes) {
  const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
    throw new CodecMediaException("Invalid JPEG data");
  }

  const quantTables = new Array(4).fill(null);
  const huffmanDc = new Array(4).fill(null);
  const huffmanAc = new Array(4).fill(null);

  let frame = null;
  let restartInterval = 0;
  let index = 2;

  while (index < data.length) {
    if (data[index] !== 0xff) {
      index += 1;
      continue;
    }

    while (index < data.length && data[index] === 0xff) {
      index += 1;
    }
    if (index >= data.length) break;

    const marker = data[index++];

    if (marker === 0xd9) {
      break;
    }

    if (marker === 0xc2) {
      throw new CodecMediaException("Unsupported JPEG: progressive JPEG is not supported by zero-dependency decoder");
    }

    if (marker === 0xda) {
      if (!frame) {
        throw new CodecMediaException("Invalid JPEG data: missing SOF0 frame before SOS");
      }

      const segmentLength = readU16BE(data, index);
      index += 2;
      const segmentStart = index;
      const segmentEnd = segmentStart + segmentLength - 2;
      if (segmentEnd > data.length) {
        throw new CodecMediaException("Invalid JPEG SOS segment length");
      }

      const scan = parseSos(data.subarray(segmentStart, segmentEnd), frame, huffmanDc, huffmanAc);
      const entropy = collectEntropyData(data, segmentEnd);
      return decodeScanToRgb(frame, scan, entropy.bytes, quantTables, restartInterval, huffmanDc, huffmanAc);
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }

    if (index + 1 >= data.length) {
      throw new CodecMediaException("Invalid JPEG marker segment");
    }

    const segmentLength = readU16BE(data, index);
    index += 2;
    const segmentStart = index;
    const segmentEnd = segmentStart + segmentLength - 2;
    if (segmentLength < 2 || segmentEnd > data.length) {
      throw new CodecMediaException("Invalid JPEG segment length");
    }

    const segment = data.subarray(segmentStart, segmentEnd);
    if (marker === 0xdb) {
      parseDqt(segment, quantTables);
    } else if (marker === 0xc4) {
      parseDht(segment, huffmanDc, huffmanAc);
    } else if (marker === 0xc0) {
      frame = parseSof0(segment);
    } else if (marker === 0xdd) {
      if (segment.length !== 2) {
        throw new CodecMediaException("Invalid JPEG DRI segment");
      }
      restartInterval = readU16BE(segment, 0);
    }

    index = segmentEnd;
  }

  throw new CodecMediaException("Invalid JPEG data: missing SOS marker");
}

function parseDqt(segment, quantTables) {
  let i = 0;
  while (i < segment.length) {
    const pqtq = segment[i++];
    const precision = (pqtq >> 4) & 0x0f;
    const tableId = pqtq & 0x0f;
    if (precision !== 0) {
      throw new CodecMediaException("Unsupported JPEG quantization precision (only 8-bit is supported)");
    }
    if (tableId > 3 || i + 64 > segment.length) {
      throw new CodecMediaException("Invalid JPEG quantization table");
    }

    const qt = new Int16Array(64);
    for (let k = 0; k < 64; k++) {
      qt[ZIGZAG[k]] = segment[i++];
    }
    quantTables[tableId] = qt;
  }
}

function parseDht(segment, huffmanDc, huffmanAc) {
  let i = 0;
  while (i < segment.length) {
    if (i + 17 > segment.length) {
      throw new CodecMediaException("Invalid JPEG Huffman table segment");
    }

    const tcth = segment[i++];
    const tableClass = (tcth >> 4) & 0x0f;
    const tableId = tcth & 0x0f;
    const counts = new Uint8Array(segment.subarray(i, i + 16));
    i += 16;

    let total = 0;
    for (let c = 0; c < 16; c++) total += counts[c];
    if (i + total > segment.length) {
      throw new CodecMediaException("Invalid JPEG Huffman values");
    }
    const values = new Uint8Array(segment.subarray(i, i + total));
    i += total;

    const table = buildHuffmanTable(counts, values);
    if (tableClass === 0) {
      huffmanDc[tableId] = table;
    } else if (tableClass === 1) {
      huffmanAc[tableId] = table;
    }
  }
}

function parseSof0(segment) {
  if (segment.length < 8) {
    throw new CodecMediaException("Invalid JPEG SOF0 segment");
  }

  const precision = segment[0];
  const height = readU16BE(segment, 1);
  const width = readU16BE(segment, 3);
  const componentCount = segment[5];
  if (precision !== 8) {
    throw new CodecMediaException("Unsupported JPEG precision (only 8-bit is supported)");
  }
  if (!(componentCount === 1 || componentCount === 3)) {
    throw new CodecMediaException("Unsupported JPEG component layout (only grayscale and YCbCr are supported)");
  }

  if (segment.length !== 6 + componentCount * 3) {
    throw new CodecMediaException("Invalid JPEG SOF0 component table length");
  }

  const components = new Map();
  let maxH = 0;
  let maxV = 0;
  let offset = 6;
  for (let i = 0; i < componentCount; i++) {
    const id = segment[offset++];
    const hv = segment[offset++];
    const quantTableId = segment[offset++];
    const h = (hv >> 4) & 0x0f;
    const v = hv & 0x0f;
    if (h <= 0 || v <= 0) {
      throw new CodecMediaException("Invalid JPEG sampling factors");
    }
    maxH = Math.max(maxH, h);
    maxV = Math.max(maxV, v);
    components.set(id, {
      id,
      h,
      v,
      quantTableId,
      pred: 0,
      blocks: [],
      blocksPerLine: 0,
      blocksPerColumn: 0,
    });
  }

  return {
    width,
    height,
    components,
    componentIds: [...components.keys()],
    maxH,
    maxV,
  };
}

function parseSos(segment, frame, huffmanDc, huffmanAc) {
  if (segment.length < 6) {
    throw new CodecMediaException("Invalid JPEG SOS segment");
  }

  const componentsInScan = segment[0];
  if (segment.length !== 1 + componentsInScan * 2 + 3) {
    throw new CodecMediaException("Invalid JPEG SOS payload length");
  }

  const components = [];
  let offset = 1;
  for (let i = 0; i < componentsInScan; i++) {
    const id = segment[offset++];
    const tableSelector = segment[offset++];
    const dcTableId = (tableSelector >> 4) & 0x0f;
    const acTableId = tableSelector & 0x0f;
    if (!frame.components.has(id)) {
      throw new CodecMediaException(`Invalid JPEG SOS component id: ${id}`);
    }
    if (!huffmanDc[dcTableId] || !huffmanAc[acTableId]) {
      throw new CodecMediaException(`Missing JPEG Huffman table for component id ${id}`);
    }
    components.push({ id, dcTableId, acTableId });
  }

  const spectralStart = segment[offset++];
  const spectralEnd = segment[offset++];
  const approx = segment[offset++];
  if (!(spectralStart === 0 && spectralEnd === 63 && approx === 0)) {
    throw new CodecMediaException("Unsupported JPEG scan mode (baseline sequential only)");
  }

  return { components };
}

function collectEntropyData(data, startIndex) {
  const out = [];
  let i = startIndex;
  while (i < data.length) {
    const value = data[i++];
    if (value !== 0xff) {
      out.push(value);
      continue;
    }

    if (i >= data.length) break;
    let marker = data[i++];
    while (marker === 0xff && i < data.length) {
      marker = data[i++];
    }

    if (marker === 0x00) {
      out.push(0xff);
      continue;
    }

    if (marker >= 0xd0 && marker <= 0xd7) {
      continue;
    }

    if (marker === 0xd9) {
      return { bytes: Uint8Array.from(out), nextIndex: i };
    }

    return { bytes: Uint8Array.from(out), nextIndex: i - 2 };
  }
  return { bytes: Uint8Array.from(out), nextIndex: i };
}

function buildHuffmanTable(codeLengths, values) {
  const table = Array.from({ length: 17 }, () => new Map());
  let code = 0;
  let valueIndex = 0;
  for (let length = 1; length <= 16; length++) {
    const count = codeLengths[length - 1] ?? 0;
    for (let i = 0; i < count; i++) {
      table[length].set(code, values[valueIndex++]);
      code += 1;
    }
    code <<= 1;
  }
  return table;
}

function decodeScanToRgb(frame, scan, entropyBytes, quantTables, restartInterval, huffmanDc, huffmanAc) {
  const mcusPerLine = Math.ceil(frame.width / (8 * frame.maxH));
  const mcusPerColumn = Math.ceil(frame.height / (8 * frame.maxV));

  for (const component of frame.components.values()) {
    component.blocksPerLine = mcusPerLine * component.h;
    component.blocksPerColumn = mcusPerColumn * component.v;
    component.blocks = Array.from({ length: component.blocksPerColumn }, () =>
      new Array(component.blocksPerLine)
    );
    component.pred = 0;
    if (!quantTables[component.quantTableId]) {
      throw new CodecMediaException(`Missing JPEG quantization table: ${component.quantTableId}`);
    }
  }

  const bitReader = new BitReader(entropyBytes);
  let mcuCounter = 0;

  for (let my = 0; my < mcusPerColumn; my++) {
    for (let mx = 0; mx < mcusPerLine; mx++) {
      for (const scanComp of scan.components) {
        const component = frame.components.get(scanComp.id);
        const qt = quantTables[component.quantTableId];
        for (let vy = 0; vy < component.v; vy++) {
          for (let vx = 0; vx < component.h; vx++) {
            const block = decodeBlock(bitReader, component, scanComp, qt, huffmanDc, huffmanAc);
            component.blocks[my * component.v + vy][mx * component.h + vx] = block;
          }
        }
      }

      mcuCounter += 1;
      if (restartInterval > 0 && (mcuCounter % restartInterval) === 0) {
        for (const component of frame.components.values()) {
          component.pred = 0;
        }
        bitReader.alignByte();
      }
    }
  }

  const ids = frame.componentIds;
  const yComp = frame.components.get(ids[0]);
  const cbComp = ids.length > 1 ? frame.components.get(ids[1]) : null;
  const crComp = ids.length > 2 ? frame.components.get(ids[2]) : null;

  const rgb = Buffer.alloc(frame.width * frame.height * 3);
  let out = 0;
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const yy = sampleComponent(yComp, frame, x, y);
      if (!cbComp || !crComp) {
        const g = clampByte(yy);
        rgb[out++] = g;
        rgb[out++] = g;
        rgb[out++] = g;
        continue;
      }

      const cb = sampleComponent(cbComp, frame, x, y);
      const cr = sampleComponent(crComp, frame, x, y);
      const r = yy + 1.402 * (cr - 128);
      const g = yy - 0.344136 * (cb - 128) - 0.714136 * (cr - 128);
      const b = yy + 1.772 * (cb - 128);

      rgb[out++] = clampByte(r);
      rgb[out++] = clampByte(g);
      rgb[out++] = clampByte(b);
    }
  }

  return {
    width: frame.width,
    height: frame.height,
    rgb,
  };
}

function decodeBlock(bitReader, component, scanComp, quantTable, huffmanDc, huffmanAc) {
  const block = new Float64Array(64);

  const dcSymbol = decodeHuffman(bitReader, scanComp.dcTableId, true, huffmanDc, huffmanAc);
  const dcDiff = receiveAndExtend(bitReader, dcSymbol);
  component.pred += dcDiff;
  block[0] = component.pred;

  let k = 1;
  while (k < 64) {
    const rs = decodeHuffman(bitReader, scanComp.acTableId, false, huffmanDc, huffmanAc);
    const run = rs >> 4;
    const size = rs & 0x0f;
    if (size === 0) {
      if (run === 15) {
        k += 16;
        continue;
      }
      break;
    }
    k += run;
    if (k >= 64) break;
    block[ZIGZAG[k]] = receiveAndExtend(bitReader, size);
    k += 1;
  }

  for (let i = 0; i < 64; i++) {
    block[i] *= quantTable[i];
  }

  return inverseDct(block);
}

function decodeHuffman(bitReader, tableId, isDc, huffmanDc, huffmanAc) {
  const table = isDc ? huffmanDc[tableId] : huffmanAc[tableId];
  if (!table) {
    throw new CodecMediaException(`Missing JPEG Huffman table ${isDc ? "DC" : "AC"}: ${tableId}`);
  }

  let code = 0;
  for (let length = 1; length <= 16; length++) {
    code = (code << 1) | bitReader.readBit();
    const value = table[length].get(code);
    if (value !== undefined) return value;
  }
  throw new CodecMediaException("Invalid JPEG Huffman code");
}

function receiveAndExtend(bitReader, size) {
  if (size === 0) return 0;
  const value = bitReader.readBits(size);
  const threshold = 1 << (size - 1);
  if (value >= threshold) return value;
  return value + ((-1 << size) + 1);
}

function inverseDct(input) {
  const out = new Uint8Array(64);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      let sum = 0;
      for (let v = 0; v < 8; v++) {
        for (let u = 0; u < 8; u++) {
          sum +=
            C[u] *
            C[v] *
            input[v * 8 + u] *
            COS_TABLE[x][u] *
            COS_TABLE[y][v];
        }
      }
      out[y * 8 + x] = clampByte(Math.round(sum / 4 + 128));
    }
  }
  return out;
}

function sampleComponent(component, frame, x, y) {
  const xScaled = Math.floor((x * component.h) / frame.maxH);
  const yScaled = Math.floor((y * component.v) / frame.maxV);
  const blockX = Math.floor(xScaled / 8);
  const blockY = Math.floor(yScaled / 8);
  const sampleX = xScaled & 7;
  const sampleY = yScaled & 7;
  const row = component.blocks[blockY];
  const block = row?.[blockX];
  if (!block) return 0;
  return block[sampleY * 8 + sampleX] ?? 0;
}

function writeBmp24(width, height, rgb, output) {
  const bytesPerPixel = 3;
  const rawStride = width * bytesPerPixel;
  const stride = (rawStride + 3) & ~3;
  const imageSize = stride * height;
  const fileSize = 14 + 40 + imageSize;

  const out = Buffer.alloc(fileSize, 0);
  out.write("BM", 0, "ascii");
  out.writeUInt32LE(fileSize, 2);
  out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(width, 18);
  out.writeInt32LE(height, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(24, 28);
  out.writeUInt32LE(0, 30);
  out.writeUInt32LE(imageSize, 34);
  out.writeInt32LE(2835, 38);
  out.writeInt32LE(2835, 42);

  let dst = 54;
  for (let y = height - 1; y >= 0; y--) {
    let src = y * width * 3;
    for (let x = 0; x < width; x++) {
      const r = rgb[src++];
      const g = rgb[src++];
      const b = rgb[src++];
      out[dst++] = b;
      out[dst++] = g;
      out[dst++] = r;
    }
    while ((dst - 54) % stride !== 0) {
      out[dst++] = 0;
    }
  }

  fs.writeFileSync(output, out);
}

function readU16BE(bytes, offset) {
  return ((bytes[offset] & 0xff) << 8) | (bytes[offset + 1] & 0xff);
}

function clampByte(value) {
  if (value <= 0) return 0;
  if (value >= 255) return 255;
  return value | 0;
}

class BitReader {
  #bytes;
  #index;
  #bitCount;
  #current;

  constructor(bytes) {
    this.#bytes = bytes;
    this.#index = 0;
    this.#bitCount = 0;
    this.#current = 0;
  }

  readBit() {
    if (this.#bitCount === 0) {
      if (this.#index >= this.#bytes.length) {
        throw new CodecMediaException("Unexpected end of JPEG entropy stream");
      }
      this.#current = this.#bytes[this.#index++];
      this.#bitCount = 8;
    }

    const bit = (this.#current >> 7) & 1;
    this.#current = (this.#current << 1) & 0xff;
    this.#bitCount -= 1;
    return bit;
  }

  readBits(count) {
    let value = 0;
    for (let i = 0; i < count; i++) {
      value = (value << 1) | this.readBit();
    }
    return value;
  }

  alignByte() {
    this.#bitCount = 0;
  }
}

