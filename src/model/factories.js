export const createProbeResult = ({
  input,
  mimeType,
  extension,
  mediaType,
  durationMillis = null,
  streams = [],
  tags = {},
}) => ({ input, mimeType, extension, mediaType, durationMillis, streams, tags });

export const createStreamInfo = ({
  index,
  kind,
  codec,
  bitrateKbps = null,
  sampleRate = null,
  channels = null,
  width = null,
  height = null,
  frameRate = null,
}) => ({ index, kind, codec, bitrateKbps, sampleRate, channels, width, height, frameRate });

export const createMetadata = (entries = {}) => ({ entries });

export const createValidationResult = ({ valid, warnings = [], errors = [] }) => ({
  valid,
  warnings,
  errors,
});

export const createExtractionResult = ({ outputFile, format }) => ({ outputFile, format });

export const createConversionResult = ({ outputFile, format, reencoded }) => ({
  outputFile,
  format,
  reencoded,
});

export const createPlaybackResult = ({ started, backend, mediaType, message }) => ({
  started,
  backend,
  mediaType,
  message,
});

