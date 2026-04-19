import type { OperationName, ParsedEditObjectives } from "./types.js";

interface RuntimeOnlyPhraseMatch {
  phrase: string;
  operation: OperationName;
  mode?: "substring" | "word" | "regex";
}

const RUNTIME_ONLY_PHRASE_MATCHERS: RuntimeOnlyPhraseMatch[] = [
  { phrase: "reverb", operation: "reverb" },
  { phrase: "delay", operation: "delay" },
  { phrase: "echo", operation: "echo" },
  { phrase: "bitcrush", operation: "bitcrush" },
  { phrase: "bit crush", operation: "bitcrush" },
  { phrase: "distortion", operation: "distortion" },
  { phrase: "distort", operation: "distortion" },
  { phrase: "saturation", operation: "saturation" },
  { phrase: "saturate", operation: "saturation" },
  { phrase: "flanger", operation: "flanger" },
  { phrase: "phaser", operation: "phaser" },
  { phrase: "pitch shift", operation: "pitch_shift" },
  { phrase: "pitch up", operation: "pitch_shift" },
  { phrase: "pitch down", operation: "pitch_shift" },
  { phrase: "transpose", operation: "pitch_shift" },
  { phrase: "reverse", operation: "reverse" },
  { phrase: "trim silence", operation: "trim_silence" },
  { phrase: "remove silence", operation: "trim_silence" },
  { phrase: "speed up", operation: "time_stretch" },
  { phrase: "slow down", operation: "time_stretch" },
  { phrase: "time stretch", operation: "time_stretch" },
  {
    phrase: "\\bpan(?:\\s+(?:left|right|center|centre)|\\s+it\\s+(?:left|right))\\b",
    operation: "pan",
    mode: "regex",
  },
  { phrase: "make it mono", operation: "mono_sum" },
  { phrase: "sum to mono", operation: "mono_sum" },
  { phrase: "collapse to mono", operation: "mono_sum" },
  { phrase: "convert to mono", operation: "mono_sum" },
];

/**
 * Normalizes a natural-language request into a small set of baseline planning
 * objectives that can be mapped onto explicit transform steps.
 */
export function parseUserRequest(userRequest: string): ParsedEditObjectives {
  const normalizedRequest = normalizeRequest(userRequest);
  const runtimeOnlyMatches = parseRuntimeOnlyRequests(normalizedRequest);
  const parsed: ParsedEditObjectives = {
    raw_request: userRequest,
    normalized_request: normalizedRequest,
    request_classification: "supported",
    wants_darker: containsAny(normalizedRequest, [
      "darker",
      "darken",
      "less bright",
      "reduce brightness",
      "softer top end",
    ]),
    wants_brighter: containsAny(normalizedRequest, ["brighter", "brighten", "more presence"]),
    wants_more_air: containsAny(normalizedRequest, [
      "airier",
      "more air",
      "add some air",
      "add a little air",
      "open up the top",
      "more sparkle",
    ]),
    wants_cleaner: containsAny(normalizedRequest, [
      "cleaner",
      "clean up",
      "clean this",
      "clean it up",
    ]),
    wants_less_harsh: containsAny(normalizedRequest, [
      "less harsh",
      "reduce harsh",
      "tame harsh",
      "smoother",
      "softer",
      "less aggressive",
      "harsh ring",
      "ringing resonance",
      "resonance",
    ]),
    wants_less_muddy: containsAny(normalizedRequest, [
      "less muddy",
      "reduce mud",
      "clean up low mids",
    ]),
    wants_more_warmth: containsAny(normalizedRequest, ["warmer", "more warmth", "fuller"]),
    wants_remove_rumble: containsAny(normalizedRequest, ["rumble", "subsonic", "low end noise"]),
    wants_louder: containsAny(normalizedRequest, ["louder", "turn up", "more level"]),
    wants_quieter: containsAny(normalizedRequest, ["quieter", "turn down", "lower level"]),
    wants_more_even_level: containsAny(normalizedRequest, ["normalize", "normalise"]),
    wants_more_controlled_dynamics: wantsMoreControlledDynamics(normalizedRequest),
    wants_peak_control: containsAny(normalizedRequest, [
      "control peaks",
      "control the peaks",
      "catch peaks",
      "keep peaks in check",
      "limit peaks",
      "peak limiting",
      "use a limiter",
      "limiter",
    ]),
    wants_denoise: containsAny(normalizedRequest, [
      "remove noise",
      "reduce noise",
      "noise reduction",
      "denoise",
      "de noise",
      "remove hiss",
      "reduce hiss",
      "dehiss",
      "de hiss",
    ]),
    wants_tame_sibilance: containsAny(normalizedRequest, [
      "tame sibilance",
      "tame the sibilance",
      "reduce sibilance",
      "less sibilant",
      "de ess",
      "de-ess",
      "deess",
      "de esser",
      "de-esser",
      "deesser",
      "tame the ess",
      "soften the ess",
    ]),
    wants_remove_clicks: containsAny(normalizedRequest, [
      "remove clicks",
      "removing clicks",
      "reduce clicks",
      "clean up clicks",
      "declick",
      "de click",
      "remove click",
      "removing click",
      "click repair",
      "repair clicks",
      "remove pops",
      "reduce pops",
      "repair pops",
    ]),
    wants_remove_hum:
      containsAny(normalizedRequest, [
        "remove hum",
        "reduce hum",
        "dehum",
        "de hum",
        "remove buzz",
        "reduce buzz",
        "mains hum",
        "electrical hum",
      ]) ||
      ((normalizedRequest.includes("hum") || normalizedRequest.includes("buzz")) &&
        containsAny(normalizedRequest, ["remove", "reduce"])),
    wants_wider: containsAny(normalizedRequest, [
      "wider",
      "widen",
      "more width",
      "stereo width",
      "wider stereo",
    ]),
    wants_narrower: containsAny(normalizedRequest, [
      "narrower",
      "narrow the stereo",
      "reduce width",
      "less width",
      "make it narrower",
    ]),
    preserve_punch: containsAny(normalizedRequest, [
      "keep the punch",
      "keep punch",
      "preserve punch",
      "preserve the punch",
      "without losing punch",
      "without losing the punch",
      "without crushing it",
      "without crushing the sound",
      "without crushing the peaks",
      "keep the transients",
      "preserve transient",
    ]),
    supported_but_underspecified_requests: parseUnderspecifiedRequests(normalizedRequest),
    unsupported_requests: parseUnsupportedRequests(normalizedRequest),
    supported_runtime_only_but_not_planner_enabled_requests: runtimeOnlyMatches.map(
      (match) => match.phrase,
    ),
    runtime_only_operations_requested: [
      ...new Set(runtimeOnlyMatches.map((match) => match.operation)),
    ],
    intensity: parseIntensity(normalizedRequest),
  };

  const humFrequencyHz = parseHumFrequency(normalizedRequest);
  if (humFrequencyHz !== undefined) {
    parsed.hum_frequency_hz = humFrequencyHz;
  }

  const trimRange = parseTrimRange(normalizedRequest);
  if (trimRange) {
    parsed.trim_range = trimRange;
  }

  const fadeInSeconds = parseNamedDuration(normalizedRequest, "fade in");
  if (fadeInSeconds !== undefined) {
    parsed.fade_in_seconds = fadeInSeconds;
  }

  const fadeOutSeconds = parseNamedDuration(normalizedRequest, "fade out");
  if (fadeOutSeconds !== undefined) {
    parsed.fade_out_seconds = fadeOutSeconds;
  }

  parsed.request_classification = classifyRequest(parsed);

  return parsed;
}

function normalizeRequest(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsAny(value: string, phrases: string[]): boolean {
  return phrases.some((phrase) => value.includes(phrase));
}

function parseIntensity(value: string): ParsedEditObjectives["intensity"] {
  if (containsAny(value, ["slightly", "a little", "a bit", "subtle", "slight"])) {
    return "subtle";
  }

  if (containsAny(value, ["much", "significantly", "a lot", "strongly"])) {
    return "strong";
  }

  return "default";
}

function parseUnsupportedRequests(value: string): string[] {
  const matches = new Set<string>();

  collectMatchedPhrases(matches, value, [
    "declip",
    "de clip",
    "repair clipping",
    "remove reverb",
    "reduce reverb",
    "de reverb",
    "dereverb",
  ]);

  return [...matches];
}

function parseUnderspecifiedRequests(value: string): string[] {
  const matches = new Set<string>();

  collectMatchedPhrases(matches, value, [
    "make it better",
    "make this better",
    "hit harder",
    "harder",
    "bigger",
    "improve it",
    "fix it",
  ]);

  return [...matches];
}

function parseRuntimeOnlyRequests(value: string): RuntimeOnlyPhraseMatch[] {
  const matches: RuntimeOnlyPhraseMatch[] = [];
  const seen = new Set<string>();

  for (const matcher of RUNTIME_ONLY_PHRASE_MATCHERS) {
    if (!matchesRuntimeOnlyPhrase(value, matcher)) {
      continue;
    }

    const key = `${matcher.phrase}:${matcher.operation}`;
    if (seen.has(key)) {
      continue;
    }

    matches.push(matcher);
    seen.add(key);
  }

  return matches;
}

function classifyRequest(
  parsed: ParsedEditObjectives,
): ParsedEditObjectives["request_classification"] {
  if (parsed.unsupported_requests.length > 0) {
    return "unsupported";
  }

  if (
    parsed.supported_runtime_only_but_not_planner_enabled_requests.length > 0 &&
    parsed.supported_but_underspecified_requests.length === 0 &&
    !hasSupportedIntent(parsed)
  ) {
    return "supported_runtime_only_but_not_planner_enabled";
  }

  if (parsed.supported_but_underspecified_requests.length > 0 || !hasSupportedIntent(parsed)) {
    return "supported_but_underspecified";
  }

  if (parsed.supported_runtime_only_but_not_planner_enabled_requests.length > 0) {
    return "supported_runtime_only_but_not_planner_enabled";
  }

  return "supported";
}

function hasSupportedIntent(parsed: ParsedEditObjectives): boolean {
  return (
    parsed.wants_darker ||
    parsed.wants_brighter ||
    parsed.wants_cleaner ||
    parsed.wants_less_harsh ||
    parsed.wants_less_muddy ||
    parsed.wants_more_warmth ||
    parsed.wants_remove_rumble ||
    parsed.wants_louder ||
    parsed.wants_quieter ||
    parsed.wants_more_controlled_dynamics ||
    parsed.wants_peak_control ||
    parsed.wants_denoise ||
    parsed.wants_wider ||
    parsed.wants_narrower ||
    parsed.trim_range !== undefined ||
    parsed.fade_in_seconds !== undefined ||
    parsed.fade_out_seconds !== undefined
  );
}

function wantsMoreControlledDynamics(value: string): boolean {
  return (
    containsAny(value, [
      "more controlled",
      "better controlled",
      "control the dynamics",
      "compress",
      "compression",
      "glue it a bit",
      "glue it slightly",
    ]) ||
    (value.includes("tighter") && value.includes("controlled"))
  );
}

function collectMatchedPhrases(matches: Set<string>, value: string, phrases: string[]): void {
  for (const phrase of phrases) {
    if (value.includes(phrase)) {
      matches.add(phrase);
    }
  }
}

function matchesRuntimeOnlyPhrase(value: string, matcher: RuntimeOnlyPhraseMatch): boolean {
  switch (matcher.mode) {
    case "regex":
      return new RegExp(matcher.phrase).test(value);
    case "word":
      return new RegExp(`\\b${escapeForRegex(matcher.phrase)}\\b`).test(value);
    default:
      return value.includes(matcher.phrase);
  }
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseTrimRange(value: string): ParsedEditObjectives["trim_range"] {
  const match = value.match(
    /(?:trim|keep|cut)\s+(?:from\s+)?(\d+(?:\.\d+)?)\s*s(?:econds?)?\s+(?:to|until|through)\s+(\d+(?:\.\d+)?)\s*s(?:econds?)?/,
  );
  if (!match) {
    return undefined;
  }

  const startSeconds = Number(match[1]);
  const endSeconds = Number(match[2]);

  if (
    !Number.isFinite(startSeconds) ||
    !Number.isFinite(endSeconds) ||
    endSeconds <= startSeconds
  ) {
    return undefined;
  }

  return {
    start_seconds: startSeconds,
    end_seconds: endSeconds,
  };
}

function parseNamedDuration(value: string, label: "fade in" | "fade out"): number | undefined {
  const match = value.match(
    new RegExp(`${label}\\s+(\\d+(?:\\.\\d+)?)\\s*(?:s|sec|secs|second|seconds)`),
  );
  if (!match) {
    return undefined;
  }

  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

function parseHumFrequency(value: string): number | undefined {
  const explicitMatch = value.match(/\b(50|60)\s*hz\b/);
  if (explicitMatch) {
    return Number(explicitMatch[1]);
  }

  if (value.includes("50 cycle")) {
    return 50;
  }

  if (value.includes("60 cycle")) {
    return 60;
  }

  return undefined;
}
