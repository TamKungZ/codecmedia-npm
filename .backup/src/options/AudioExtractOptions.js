export const audioExtractDefaults = (targetFormat = "m4a") => ({
  targetFormat: targetFormat && targetFormat.trim() ? targetFormat : "m4a",
  bitrateKbps: 192,
  streamIndex: 0,
});

