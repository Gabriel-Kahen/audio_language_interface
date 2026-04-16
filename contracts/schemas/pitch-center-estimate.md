# PitchCenterEstimate Schema

## Purpose

Define the standalone machine-readable output emitted by `modules/analysis`
`estimatePitchCenter(...)`.

## Shape

```json
{
  "voicing": "voiced",
  "confidence": 0.93,
  "frequency_hz": 220,
  "midi_note": 57,
  "note_name": "A3",
  "uncertainty_cents": 3.4,
  "analyzed_window_count": 3,
  "voiced_window_count": 3,
  "voiced_window_ratio": 1
}
```

## Required fields

- `voicing`
- `confidence`
- `analyzed_window_count`
- `voiced_window_count`
- `voiced_window_ratio`

## Optional fields

- `frequency_hz`
- `midi_note`
- `note_name`
- `uncertainty_cents`

The frequency, note, and uncertainty fields are only present when the estimator
returns `voiced` or `mixed`.

## Field semantics

- `voicing`: conservative state classification of the detected pitch support.
  Current values are `voiced`, `mixed`, and `unvoiced`.
- `confidence`: bounded heuristic confidence from `0` to `1`.
- `frequency_hz`: score-weighted pitch center in Hertz.
- `midi_note`: nearest integer MIDI note for `frequency_hz`.
- `note_name`: chromatic note name with octave for `midi_note`.
- `uncertainty_cents`: score-weighted deviation around the estimated center.
- `analyzed_window_count`: number of windows loud enough to inspect.
- `voiced_window_count`: number of analyzed windows that yielded a valid pitch candidate.
- `voiced_window_ratio`: `voiced_window_count / analyzed_window_count`, or `0` when no windows were analyzed.

## Notes

- This payload is intentionally narrow and separate from `AnalysisReport`.
- It is deterministic for the same decoded WAV samples and analyzer version.
