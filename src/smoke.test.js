import { CodecMedia } from "./index.js";

const engine = CodecMedia.createDefault();
console.log("CodecMedia npm port loaded:", typeof engine.probe === "function");

