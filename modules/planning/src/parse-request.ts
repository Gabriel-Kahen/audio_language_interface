import type { OperationName, ParsedEditObjectives, RegionTargetHint } from "./types.js";

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
  { phrase: "crunchy", operation: "distortion" },
  { phrase: "crunchier", operation: "distortion" },
  { phrase: "more distorted", operation: "distortion" },
  { phrase: "saturation", operation: "saturation" },
  { phrase: "saturate", operation: "saturation" },
  { phrase: "flanger", operation: "flanger" },
  { phrase: "phaser", operation: "phaser" },
  { phrase: "reverse", operation: "reverse" },
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
    wants_trim_silence: containsAny(normalizedRequest, [
      "trim silence",
      "remove silence",
      "trim the silence",
      "cut silence",
    ]),
    trim_leading_silence: wantsTrimLeadingSilence(normalizedRequest),
    trim_trailing_silence: wantsTrimTrailingSilence(normalizedRequest),
    wants_darker: containsAny(normalizedRequest, [
      "darker",
      "darken",
      "less bright",
      "reduce brightness",
      "softer top end",
      "more relaxed",
      "sound more relaxed",
      "feel more relaxed",
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
      "less intense",
      "less sharp",
      "less gritty",
      "less fuzzy",
      "reduce sharp",
      "reduce intensity",
      "more relaxed",
      "sound more relaxed",
      "feel more relaxed",
      "less crunchy",
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
    wants_declip: wantsDeclip(normalizedRequest),
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
      "narrow this",
      "narrow the stereo",
      "narrow it",
      "reduce width",
      "less width",
      "make it narrower",
    ]),
    wants_more_centered: containsAny(normalizedRequest, [
      "center this more",
      "centre this more",
      "more centered",
      "more centred",
      "move it toward center",
      "move it toward centre",
      "move it to center",
      "move it to centre",
      "center it more",
      "centre it more",
      "fix stereo imbalance",
      "fix the stereo imbalance",
      "correct stereo imbalance",
      "reduce stereo imbalance",
      "fix the left right imbalance",
      "balance the stereo image",
    ]),
    wants_speed_up: containsAny(normalizedRequest, [
      "speed up",
      "speed it up",
      "speed this up",
      "faster",
      "quicken",
      "increase playback speed",
      "increase the tempo",
      "increase tempo",
    ]),
    wants_slow_down: containsAny(normalizedRequest, [
      "slow down",
      "slow it down",
      "slow this down",
      "slower",
      "stretch it out",
      "decrease playback speed",
      "reduce the tempo",
      "reduce tempo",
    ]),
    wants_pitch_shift: containsAny(normalizedRequest, [
      "pitch shift",
      "pitch up",
      "pitch it up",
      "pitch down",
      "pitch it down",
      "transpose",
      "shift the pitch",
      "raise the pitch",
      "lower the pitch",
      "up an octave",
      "down an octave",
      "whole octave",
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

  const stretchRatio = parseStretchRatio(normalizedRequest);
  if (stretchRatio !== undefined) {
    parsed.stretch_ratio = stretchRatio;
  }

  const pitchShiftSemitones = parsePitchShiftSemitones(normalizedRequest, parsed);
  if (pitchShiftSemitones !== undefined) {
    parsed.pitch_shift_semitones = pitchShiftSemitones;
  }

  const trimRange = parseTrimRange(normalizedRequest);
  if (trimRange) {
    parsed.trim_range = trimRange;
  }

  const regionTargetHint = parseRegionTargetHint(normalizedRequest, Boolean(trimRange));
  if (regionTargetHint !== undefined) {
    parsed.region_target_hint = regionTargetHint;
  }

  const fadeInSeconds = parseNamedDuration(normalizedRequest, "fade in");
  if (fadeInSeconds !== undefined) {
    parsed.fade_in_seconds = fadeInSeconds;
  }

  const fadeOutSeconds = parseNamedDuration(normalizedRequest, "fade out");
  if (fadeOutSeconds !== undefined) {
    parsed.fade_out_seconds = fadeOutSeconds;
  }

  const vagueRegionRequests = parseVagueRegionRequests(normalizedRequest, parsed);
  if (vagueRegionRequests.length > 0) {
    parsed.supported_but_underspecified_requests.push(...vagueRegionRequests);
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

function wantsDeclip(normalizedRequest: string): boolean {
  return (
    containsAny(normalizedRequest, [
      "declip",
      "de clip",
      "repair clipping",
      "reduce clipping",
      "remove clipping",
      "less clipped",
      "fix clipping",
      "clean up clipping",
      "reduce clipped",
      "remove clipped",
      "repair clipped",
      "less distorted",
      "less distortion",
      "reduce distortion",
      "remove distortion",
      "clean up distortion",
      "repair distortion",
    ]) ||
    (normalizedRequest.includes("distorted") &&
      containsAny(normalizedRequest, ["less", "reduce", "remove", "repair", "fix"]))
  );
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
    if (matcher.operation === "distortion" && isTextureReductionRequest(value)) {
      continue;
    }

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

function isTextureReductionRequest(value: string): boolean {
  return wantsDeclip(value) || containsAny(value, ["less crunchy"]);
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
    parsed.wants_trim_silence ||
    parsed.wants_darker ||
    parsed.wants_brighter ||
    parsed.wants_more_air ||
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
    parsed.wants_tame_sibilance ||
    parsed.wants_remove_clicks ||
    parsed.wants_declip ||
    parsed.wants_remove_hum ||
    parsed.wants_wider ||
    parsed.wants_narrower ||
    parsed.wants_more_centered ||
    parsed.wants_speed_up ||
    parsed.wants_slow_down ||
    parsed.wants_pitch_shift ||
    parsed.trim_range !== undefined ||
    parsed.fade_in_seconds !== undefined ||
    parsed.fade_out_seconds !== undefined
  );
}

function parseRegionTargetHint(
  value: string,
  hasExplicitTrimRange: boolean,
): RegionTargetHint | undefined {
  if (!hasExplicitTrimRange) {
    const explicitRangeMatch = value.match(
      /\b(?:from|between)\s+(\d+(?:\.\d+)?)\s*s(?:econds?)?\s+(?:to|until|through|and)\s+(\d+(?:\.\d+)?)\s*s(?:econds?)?\b/u,
    );

    if (explicitRangeMatch) {
      const startSeconds = Number(explicitRangeMatch[1]);
      const endSeconds = Number(explicitRangeMatch[2]);

      if (
        Number.isFinite(startSeconds) &&
        Number.isFinite(endSeconds) &&
        endSeconds > startSeconds
      ) {
        return {
          kind: "absolute_range",
          start_seconds: startSeconds,
          end_seconds: endSeconds,
          source_phrase: explicitRangeMatch[0].trim(),
        };
      }
    }
  }

  const leadingWindowMatch = value.match(
    /\b(?:only|just)?\s*(?:in|on|for)?\s*the first\s+(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)\b/u,
  );
  if (leadingWindowMatch) {
    const durationSeconds = Number(leadingWindowMatch[1]);

    if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
      return {
        kind: "leading_window",
        duration_seconds: durationSeconds,
        source_phrase: leadingWindowMatch[0].trim(),
      };
    }
  }

  if (value.includes("first second")) {
    return {
      kind: "leading_window",
      duration_seconds: 1,
      source_phrase: "first second",
    };
  }

  const leadingHalfSecondMatch = value.match(/\bfirst half(?:\s+a)?\s+second\b/u);
  if (leadingHalfSecondMatch) {
    return {
      kind: "leading_window",
      duration_seconds: 0.5,
      source_phrase: leadingHalfSecondMatch[0].trim(),
    };
  }

  const trailingWindowMatch = value.match(
    /\b(?:only|just)?\s*(?:in|on|for)?\s*the last\s+(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)\b/u,
  );
  if (trailingWindowMatch) {
    const durationSeconds = Number(trailingWindowMatch[1]);

    if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
      return {
        kind: "trailing_window",
        duration_seconds: durationSeconds,
        source_phrase: trailingWindowMatch[0].trim(),
      };
    }
  }

  if (value.includes("last second")) {
    return {
      kind: "trailing_window",
      duration_seconds: 1,
      source_phrase: "last second",
    };
  }

  const trailingHalfSecondMatch = value.match(/\blast half(?:\s+a)?\s+second\b/u);
  if (trailingHalfSecondMatch) {
    return {
      kind: "trailing_window",
      duration_seconds: 0.5,
      source_phrase: trailingHalfSecondMatch[0].trim(),
    };
  }

  return undefined;
}

function parseVagueRegionRequests(value: string, parsed: ParsedEditObjectives): string[] {
  if (
    parsed.region_target_hint !== undefined ||
    parsed.wants_trim_silence ||
    !hasRegionScopeCandidate(parsed)
  ) {
    return [];
  }

  const matches = new Set<string>();

  collectMatchedPhrases(matches, value, [
    "intro",
    "outro",
    "beginning",
    "at the start",
    "at the end",
    "ending word",
    "middle section",
    "middle part",
  ]);

  return [...matches];
}

function hasRegionScopeCandidate(parsed: ParsedEditObjectives): boolean {
  return (
    parsed.wants_darker ||
    parsed.wants_brighter ||
    parsed.wants_more_air ||
    parsed.wants_less_harsh ||
    parsed.wants_less_muddy ||
    parsed.wants_more_warmth ||
    parsed.wants_remove_rumble ||
    parsed.wants_louder ||
    parsed.wants_quieter ||
    parsed.wants_more_even_level ||
    parsed.wants_denoise ||
    parsed.wants_tame_sibilance ||
    parsed.wants_remove_clicks ||
    parsed.wants_declip ||
    parsed.wants_remove_hum ||
    parsed.wants_wider ||
    parsed.wants_narrower ||
    parsed.wants_more_centered
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
  const durationUnitPattern = "(ms|millisecond|milliseconds|s|sec|secs|second|seconds)";
  const labelThenDurationMatch = value.match(
    new RegExp(`\\b${label}\\s+(\\d+(?:\\.\\d+)?)\\s*${durationUnitPattern}\\b`),
  );
  const durationThenLabelMatch = value.match(
    new RegExp(`\\b(\\d+(?:\\.\\d+)?)\\s*${durationUnitPattern}\\s+${label}\\b`),
  );
  const match = labelThenDurationMatch ?? durationThenLabelMatch;
  if (!match) {
    return undefined;
  }

  const valueInUnits = Number(match[1]);
  const unit = match[2] ?? "";
  const seconds =
    unit === "ms" || unit.startsWith("millisecond") ? valueInUnits / 1000 : valueInUnits;
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

function wantsTrimLeadingSilence(value: string): boolean {
  if (
    containsAny(value, [
      "leading silence",
      "start silence",
      "silence at the start",
      "silence from the start",
    ])
  ) {
    return true;
  }

  if (
    containsAny(value, [
      "trailing silence",
      "ending silence",
      "end silence",
      "silence at the end",
      "silence from the end",
    ])
  ) {
    return false;
  }

  return containsAny(value, ["trim silence", "remove silence", "trim the silence", "cut silence"]);
}

function wantsTrimTrailingSilence(value: string): boolean {
  if (
    containsAny(value, [
      "trailing silence",
      "ending silence",
      "end silence",
      "silence at the end",
      "silence from the end",
    ])
  ) {
    return true;
  }

  if (
    containsAny(value, [
      "leading silence",
      "start silence",
      "silence at the start",
      "silence from the start",
    ])
  ) {
    return false;
  }

  return containsAny(value, ["trim silence", "remove silence", "trim the silence", "cut silence"]);
}

function parseStretchRatio(value: string): number | undefined {
  const percentMatcher = value.match(
    /\b(?:speed(?: (?:it|this))? up|slow(?: (?:it|this))? down|faster|slower|time stretch|stretch(?: it)? out|increase playback speed|decrease playback speed|increase tempo|reduce tempo|decrease tempo)\b(?:\s+(?:by|around|about))?\s+(\d+(?:\.\d+)?)\s*(?:%|percent)?/,
  );
  if (percentMatcher) {
    const percent = Number(percentMatcher[1]);
    if (!Number.isFinite(percent) || percent <= 0 || percent >= 75) {
      return undefined;
    }

    if (
      containsAny(value, [
        "slow down",
        "slow it down",
        "slow this down",
        "slower",
        "stretch it out",
        "decrease playback speed",
        "reduce tempo",
        "decrease tempo",
      ])
    ) {
      return Number((1 + percent / 100).toFixed(6));
    }

    return Number((1 - percent / 100).toFixed(6));
  }

  const multiplierMatcher = value.match(
    /\b(?:speed(?: (?:it|this))? up|slow(?: (?:it|this))? down|time stretch|stretch(?: it)? out|faster|slower|increase playback speed|decrease playback speed|increase tempo|reduce tempo|decrease tempo)\b(?:\s+(?:to|by))?\s+(\d+(?:\.\d+)?)\s*x\b/,
  );
  if (multiplierMatcher) {
    const multiplier = Number(multiplierMatcher[1]);
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      return undefined;
    }

    if (
      containsAny(value, [
        "slow down",
        "slow it down",
        "slow this down",
        "slower",
        "stretch it out",
        "decrease playback speed",
        "reduce tempo",
        "decrease tempo",
      ])
    ) {
      return Number(multiplier.toFixed(6));
    }

    return Number((1 / multiplier).toFixed(6));
  }

  return undefined;
}

function parsePitchShiftSemitones(
  value: string,
  parsed: Pick<
    ParsedEditObjectives,
    "wants_pitch_shift" | "wants_speed_up" | "wants_slow_down" | "intensity"
  >,
): number | undefined {
  if (!parsed.wants_pitch_shift) {
    return undefined;
  }

  const explicitMatcher = value.match(
    /\b(?:pitch (?:up|down)|transpose|shift the pitch)\b(?:\s+(?:by|up|down))?\s+(-?\d+(?:\.\d+)?)\s+(?:semitones?|st)\b/,
  );
  if (explicitMatcher) {
    const semitones = Number(explicitMatcher[1]);
    return Number.isFinite(semitones) ? semitones : undefined;
  }

  const octaveMatcher = value.match(
    /\b(?:pitch(?:-|\s)?shift(?: the full audio)?\s+(?:(up|down|upward|downward))|pitch (?:it )?(up|down)|transpose(?: it)? (up|down|upward|downward)?|raise the pitch|lower the pitch|up|down)\b(?:[^.]*?)\b(?:(a|an|one|1|two|2)\s+)?(?:whole\s+)?octaves?\b/,
  );
  if (octaveMatcher) {
    const direction =
      octaveMatcher[1] ??
      octaveMatcher[2] ??
      octaveMatcher[3] ??
      (value.includes("down") ? "down" : "up");
    const octaveCountToken = octaveMatcher[4];
    const octaveCount = octaveCountToken === "two" || octaveCountToken === "2" ? 2 : 1;
    return direction.startsWith("down") ? -12 * octaveCount : 12 * octaveCount;
  }

  const defaultMagnitude =
    parsed.intensity === "subtle" ? 1 : parsed.intensity === "strong" ? 4 : 2;

  if (containsAny(value, ["pitch down", "pitch it down", "transpose down", "lower the pitch"])) {
    return -defaultMagnitude;
  }

  return defaultMagnitude;
}
