import { CodecMediaException } from "../../../errors/CodecMediaException.js";

export class HeifParser {
  static #HEIF_BRANDS = new Set([
    "heic",
    "heix",
    "hevc",
    "hevx",
    "heif",
    "heim",
    "heis",
    "mif1",
    "msf1",
    "avif",
    "avis",
  ]);

  static parse(bytes) {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
    if (!this.isLikelyHeif(buffer)) {
      throw new CodecMediaException("Not a HEIF/HEIC file");
    }

    const majorBrand = this.#extractMajorBrand(buffer);
    const ispe = this.#findBoxData(buffer, "ispe");
    const pixi = this.#findBoxData(buffer, "pixi");
    const width = this.#extractIspeWidth(ispe);
    const height = this.#extractIspeHeight(ispe);
    const bitDepth = this.#extractPixiBitDepth(pixi);
    return { majorBrand, width, height, bitDepth };
  }

  static isLikelyHeif(bytes) {
    const brands = this.#extractBrands(bytes);
    if (brands.length === 0) return false;
    return brands.some((brand) => this.#HEIF_BRANDS.has(brand));
  }

  static #extractMajorBrand(bytes) {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
    const header = this.#resolveFtypHeader(buffer);
    if (!header) return "";
    return buffer.slice(header.majorBrandOffset, header.majorBrandOffset + 4).toString("ascii").toLowerCase();
  }

  static #extractBrands(bytes) {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
    const header = this.#resolveFtypHeader(buffer);
    if (!header) return [];

    const brands = [buffer.slice(header.majorBrandOffset, header.majorBrandOffset + 4).toString("ascii").toLowerCase()];
    for (let i = header.compatibleBrandsOffset; i + 4 <= header.end; i += 4) {
      brands.push(buffer.slice(i, i + 4).toString("ascii").toLowerCase());
    }
    return brands;
  }

  static #resolveFtypHeader(buffer) {
    if (buffer.length < 12) return null;
    if (buffer.slice(4, 8).toString("ascii") !== "ftyp") return null;

    let boxSize = buffer.readUInt32BE(0);
    let headerSize = 8;

    if (boxSize === 1) {
      if (buffer.length < 24) return null;
      const largeSize = this.#readU64BE(buffer, 8);
      if (largeSize == null || largeSize < 24) return null;
      boxSize = largeSize;
      headerSize = 16;
    } else if (boxSize !== 0 && boxSize < 16) {
      return null;
    }

    const end = Math.min(boxSize === 0 ? buffer.length : boxSize, buffer.length);
    const majorBrandOffset = headerSize;
    const minorVersionOffset = majorBrandOffset + 4;
    const compatibleBrandsOffset = minorVersionOffset + 4;
    if (end < compatibleBrandsOffset) return null;

    return { majorBrandOffset, compatibleBrandsOffset, end };
  }

  static #extractIspeWidth(ispe) {
    if (!ispe || ispe.payloadOffset + 12 > ispe.boxEnd) {
      return null;
    }
    const width = this.#readBeInt(ispe.bytes, ispe.payloadOffset + 4);
    return width > 0 ? width : null;
  }

  static #extractIspeHeight(ispe) {
    if (!ispe || ispe.payloadOffset + 12 > ispe.boxEnd) {
      return null;
    }
    const height = this.#readBeInt(ispe.bytes, ispe.payloadOffset + 8);
    return height > 0 ? height : null;
  }

  static #extractPixiBitDepth(pixi) {
    if (!pixi) return null;
    const payloadOffset = pixi.payloadOffset;
    if (payloadOffset + 1 > pixi.boxEnd) return null;

    const channelCount = pixi.bytes[payloadOffset] & 0xff;
    if (channelCount <= 0 || payloadOffset + 1 + channelCount > pixi.boxEnd) {
      return null;
    }

    let minDepth = Number.MAX_SAFE_INTEGER;
    for (let i = 0; i < channelCount; i++) {
      const depth = pixi.bytes[payloadOffset + 1 + i] & 0xff;
      if (depth > 0 && depth < minDepth) {
        minDepth = depth;
      }
    }

    return minDepth === Number.MAX_SAFE_INTEGER ? null : minDepth;
  }

  static #findBoxData(bytes, boxType) {
    return this.#findBoxDataInRange(bytes, 0, bytes.length, boxType);
  }

  static #findBoxDataInRange(bytes, startOffset, endOffset, boxType) {
    let offset = startOffset;
    while (offset + 8 <= endOffset) {
      const boxStart = offset;
      let size = this.#readU32AsLong(bytes, offset);
      const type = bytes.slice(offset + 4, offset + 8).toString("ascii");
      let headerSize = 8;

      if (size === 1) {
        if (offset + 16 > endOffset) break;
        size = this.#readU64AsLong(bytes, offset + 8);
        headerSize = 16;
      } else if (size === 0) {
        size = endOffset - offset;
      }

      if (size < headerSize) break;

      const boxEnd = offset + size;
      if (boxEnd > endOffset || boxEnd <= offset) break;

      if (type === boxType) {
        return { bytes, boxStart, payloadOffset: offset + headerSize, boxEnd };
      }

      if (this.#isContainerType(type)) {
        const nested = this.#findBoxDataInRange(bytes, offset + headerSize, boxEnd, boxType);
        if (nested) return nested;
      }

      offset = boxEnd;
    }
    return null;
  }

  static #isContainerType(type) {
    return type === "meta"
      || type === "moov"
      || type === "trak"
      || type === "mdia"
      || type === "minf"
      || type === "stbl"
      || type === "dinf"
      || type === "edts"
      || type === "udta"
      || type === "iprp"
      || type === "ipco"
      || type === "iinf"
      || type === "iloc"
      || type === "iref"
      || type === "grpl"
      || type === "strk"
      || type === "meco"
      || type === "mere"
      || type === "traf"
      || type === "mvex"
      || type === "moof"
      || type === "sinf"
      || type === "schi"
      || type === "hnti"
      || type === "hinf"
      || type === "wave"
      || type === "ilst"
      || type === "tref"
      || type === "mfra"
      || type === "skip"
      || type === "free"
      || type === "mdat"
      || type === "jp2h"
      || type === "res "
      || type === "uuid"
      || type === "ipro"
      || type === "sgrp"
      || type === "fiin"
      || type === "paen"
      || type === "trgr"
      || type === "kind"
      || type === "ipma"
      || type === "pitm";
  }

  static #readU32AsLong(bytes, offset) {
    if (offset + 4 > bytes.length) return -1;
    return (
      ((bytes[offset] & 0xff) << 24)
      | ((bytes[offset + 1] & 0xff) << 16)
      | ((bytes[offset + 2] & 0xff) << 8)
      | (bytes[offset + 3] & 0xff)
    ) >>> 0;
  }

  static #readU64AsLong(bytes, offset) {
    if (offset + 8 > bytes.length) return -1;
    let value = 0n;
    for (let i = 0; i < 8; i++) {
      value = (value << 8n) | BigInt(bytes[offset + i] & 0xff);
    }
    const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
    return Number(value > maxSafe ? maxSafe : value);
  }

  static #readBeInt(bytes, offset) {
    if (offset + 4 > bytes.length) {
      throw new CodecMediaException("Unexpected end of HEIF data");
    }
    return ((bytes[offset] & 0xff) << 24)
      | ((bytes[offset + 1] & 0xff) << 16)
      | ((bytes[offset + 2] & 0xff) << 8)
      | (bytes[offset + 3] & 0xff);
  }

  static #readU64BE(buffer, offset) {
    if (offset + 8 > buffer.length) return null;
    let value = 0n;
    for (let i = 0; i < 8; i++) {
      value = (value << 8n) | BigInt(buffer[offset + i]);
    }
    const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
    return Number(value > maxSafe ? maxSafe : value);
  }
}

