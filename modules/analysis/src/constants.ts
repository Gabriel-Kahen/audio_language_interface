export const SCHEMA_VERSION = "1.0.0" as const;
export const ANALYZER_NAME = "default-analysis";
export const ANALYZER_VERSION = "0.1.3";

export const SEGMENT_WINDOW_SECONDS = 0.05;
export const SPECTRUM_WINDOW_SIZE = 512;
export const SPECTRUM_MAX_FRAMES = 256;
export const TRANSIENT_WINDOW_SECONDS = 0.02;
export const TRANSIENT_HOP_SECONDS = 0.01;
export const TRANSIENT_MIN_LOCAL_CONTRAST_DB = 3;
export const TRANSIENT_MIN_RMS_DBFS = -48;
export const TRANSIENT_MIN_CREST_DB = 6;
export const TRANSIENT_MIN_EVENT_DURATION_SECONDS = 0.02;
export const TRANSIENT_MIN_EVENT_SEPARATION_SECONDS = 0.05;

export const TEMPO_DEFAULT_MIN_BPM = 60;
export const TEMPO_DEFAULT_MAX_BPM = 200;
export const TEMPO_DEFAULT_MAX_CANDIDATES = 3;
