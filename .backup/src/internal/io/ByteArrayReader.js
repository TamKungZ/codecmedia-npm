import { CodecMediaException } from "../../errors/CodecMediaException.js";

/**
 * A byte array reader with position tracking, ported from Java ByteArrayReader.
 * Works with Node.js Buffer or Uint8Array.
 */
export class ByteArrayReader {
  #data;
  #position;

  constructor(data) {
    this.#data = data ?? Buffer.alloc(0);
    this.#position = 0;
  }

  get length() {
    return this.#data.length;
  }

  get position() {
    return this.#position;
  }

  set position(newPosition) {
    if (newPosition < 0 || newPosition > this.#data.length) {
      throw new CodecMediaException("Position out of bounds: " + newPosition);
    }
    this.#position = newPosition;
  }

  get remaining() {
    return this.#data.length - this.#position;
  }

  skip(bytes) {
    this.position = this.#position + bytes;
  }

  readU8() {
    this.#ensureRemaining(1);
    return this.#data[this.#position++] & 0xFF;
  }

  readU16BE() {
    this.#ensureRemaining(2);
    const value = ((this.#data[this.#position] & 0xFF) << 8) | (this.#data[this.#position + 1] & 0xFF);
    this.#position += 2;
    return value;
  }

  readU16LE() {
    this.#ensureRemaining(2);
    const value = (this.#data[this.#position] & 0xFF) | ((this.#data[this.#position + 1] & 0xFF) << 8);
    this.#position += 2;
    return value;
  }

  readU32BE() {
    this.#ensureRemaining(4);
    const d = this.#data;
    const p = this.#position;
    const value = ((d[p] & 0xFF) * 0x1000000)
      + ((d[p + 1] & 0xFF) << 16)
      + ((d[p + 2] & 0xFF) << 8)
      + (d[p + 3] & 0xFF);
    this.#position += 4;
    return value >>> 0; // unsigned
  }

  readU32LE() {
    this.#ensureRemaining(4);
    const d = this.#data;
    const p = this.#position;
    const value = (d[p] & 0xFF)
      + ((d[p + 1] & 0xFF) << 8)
      + ((d[p + 2] & 0xFF) << 16)
      + ((d[p + 3] & 0xFF) * 0x1000000);
    this.#position += 4;
    return value >>> 0; // unsigned
  }

  readU64LE() {
    this.#ensureRemaining(8);
    const d = this.#data;
    const p = this.#position;
    // Use Number (safe for values up to 2^53)
    let value = 0;
    for (let i = 7; i >= 0; i--) {
      value = value * 256 + (d[p + i] & 0xFF);
    }
    this.#position += 8;
    return value;
  }

  readBytes(length) {
    this.#ensureRemaining(length);
    const out = this.#data.slice(this.#position, this.#position + length);
    this.#position += length;
    return out;
  }

  readAscii(length) {
    const bytes = this.readBytes(length);
    return Buffer.from(bytes).toString("ascii");
  }

  peekU8(offsetFromPosition) {
    const index = this.#position + offsetFromPosition;
    if (index < 0 || index >= this.#data.length) {
      throw new CodecMediaException("Peek out of bounds: " + index);
    }
    return this.#data[index] & 0xFF;
  }

  getU8(index) {
    if (index < 0 || index >= this.#data.length) {
      throw new CodecMediaException("Index out of bounds: " + index);
    }
    return this.#data[index] & 0xFF;
  }

  #ensureRemaining(needed) {
    if (needed < 0 || this.remaining < needed) {
      throw new CodecMediaException(
        "Not enough bytes: need " + needed + ", remaining " + this.remaining
      );
    }
  }
}
