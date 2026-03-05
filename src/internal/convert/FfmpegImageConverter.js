import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { CodecMediaException } from "../../errors/CodecMediaException.js";

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "bmp",
  "tif",
  "tiff",
  "heic",
  "heif",
]);

/**
 * Image transcoder backed by an external ffmpeg binary.
 */
export class FfmpegImageConverter {
  convert(request) {
    const source = this.#normalize(request.sourceExtension);
    const target = this.#normalize(request.requestedExtension);

    if (!SUPPORTED_IMAGE_EXTENSIONS.has(source) || !SUPPORTED_IMAGE_EXTENSIONS.has(target)) {
      throw new CodecMediaException(
        `Unsupported image transcode pair: ${source || "<unknown>"} -> ${target || "<unknown>"}`
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

      const args = [
        "-hide_banner",
        "-loglevel",
        "error",
        request.options?.overwrite ? "-y" : "-n",
        "-i",
        request.input,
        ...this.#qualityArgs(target, request.options?.preset),
        output,
      ];

      execFileSync("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

      return {
        outputFile: output,
        format: target,
        reencoded: true,
      };
    } catch (err) {
      if (err instanceof CodecMediaException) throw err;

      if (err?.code === "ENOENT") {
        throw new CodecMediaException(
          "image->image transcoding requires ffmpeg to be installed and available in PATH"
        );
      }

      const stderr = Buffer.isBuffer(err?.stderr)
        ? err.stderr.toString("utf8").trim()
        : String(err?.stderr ?? "").trim();

      const detail = stderr ? `: ${stderr}` : "";
      throw new CodecMediaException(`Failed image transcode: ${request.input} -> ${output}${detail}`, err);
    }
  }

  #normalize(value) {
    const normalized = String(value ?? "").trim().toLowerCase();
    return normalized.startsWith(".") ? normalized.slice(1) : normalized;
  }

  #qualityArgs(target, preset) {
    const p = String(preset ?? "balanced").toLowerCase();
    const quality = p === "high" ? 92 : p === "fast" ? 72 : 84;

    if (target === "jpg" || target === "jpeg") {
      return ["-q:v", String(Math.max(2, Math.min(31, Math.floor((100 - quality) / 3) + 2)))];
    }
    if (target === "webp") {
      return ["-quality", String(quality)];
    }
    if (target === "png") {
      return ["-compression_level", p === "high" ? "9" : p === "fast" ? "3" : "6"];
    }
    return [];
  }
}

