import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import Ajv2020Import from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";
import { afterEach, describe, expect, it } from "vitest";
import { WaveFile } from "wavefile";

import audioVersionSchema from "../../../contracts/schemas/json/audio-version.schema.json" with {
  type: "json",
};
import commonSchema from "../../../contracts/schemas/json/common.schema.json" with { type: "json" };
import transformRecordSchema from "../../../contracts/schemas/json/transform-record.schema.json" with {
  type: "json",
};
import {
  type AudioVersion,
  applyEditPlan,
  applyOperation,
  buildFfmpegTransformCommand,
  buildOperation,
  deriveSliceMapFromTransients,
  type EditPlan,
  extractSlice,
  extractSlices,
  type FfmpegCommand,
  type FfmpegExecutionResult,
  resolveTransformOutputPath,
} from "../src/index.js";

const tempDirs: string[] = [];
const execFile = promisify(execFileCallback);

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dirPath) => rm(dirPath, { recursive: true, force: true })),
  );
});

describe("buildFfmpegTransformCommand", () => {
  it("builds an explicit ffmpeg command", () => {
    expect(
      buildFfmpegTransformCommand({
        inputPath: "/tmp/input.wav",
        outputPath: "/tmp/output.wav",
        sampleRateHz: 44100,
        channels: 2,
        filterChain: "volume=3dB",
      }),
    ).toEqual({
      executable: "ffmpeg",
      args: [
        "-y",
        "-i",
        "/tmp/input.wav",
        "-vn",
        "-sn",
        "-dn",
        "-map_metadata",
        "-1",
        "-af",
        "volume=3dB",
        "-ar",
        "44100",
        "-ac",
        "2",
        "-c:a",
        "pcm_s16le",
        "/tmp/output.wav",
      ],
      outputPath: "/tmp/output.wav",
    });
  });
});

describe("buildOperation", () => {
  it("normalizes explicit operation parameters into inspectable filters", () => {
    const result = buildOperation(
      createAudioVersion("storage/audio/source.wav").audio,
      "parametric_eq",
      {
        bands: [{ type: "bell", frequency_hz: 3800, gain_db: -2, q: 1.2 }],
      },
      { scope: "full_file" },
    );

    expect(result.filterChain).toBe("equalizer=f=3800:t=q:w=1.2:g=-2");
    expect(result.effectiveParameters).toEqual({
      bands: [{ type: "bell", frequency_hz: 3800, gain_db: -2, q: 1.2 }],
    });
  });

  it("updates duration metadata for trim", () => {
    const result = buildOperation(
      createAudioVersion("storage/audio/source.wav").audio,
      "trim",
      {},
      { scope: "time_range", start_seconds: 0.25, end_seconds: 1.25 },
    );

    expect(result.nextAudio.duration_seconds).toBe(1);
    expect(result.nextAudio.frame_count).toBe(44100);
  });

  it("normalizes trim_silence parameters into an explicit FFmpeg filter", () => {
    const result = buildOperation(
      createAudioVersion("storage/audio/source.wav").audio,
      "trim_silence",
      {
        threshold_dbfs: -42,
        trim_leading: true,
        trim_trailing: true,
        window_seconds: 0.03,
      },
      { scope: "full_file" },
    );

    expect(result.filterChain).toBe(
      "silenceremove=start_periods=1:start_threshold=-42dB:start_mode=all:detection=rms:window=0.03,areverse,silenceremove=start_periods=1:start_threshold=-42dB:start_mode=all:detection=rms:window=0.03,areverse,asetpts=N/SR/TB",
    );
    expect(result.effectiveParameters).toEqual({
      threshold_dbfs: -42,
      trim_leading: true,
      trim_trailing: true,
      window_seconds: 0.03,
    });
    expect(result.requiresOutputProbe).toBe(true);
  });

  it("normalizes reverse and mono_sum into explicit FFmpeg filters", () => {
    const reverseResult = buildOperation(
      createAudioVersion("storage/audio/source.wav").audio,
      "reverse",
      {},
      { scope: "full_file" },
    );
    const monoResult = buildOperation(
      createAudioVersion("storage/audio/source.wav").audio,
      "mono_sum",
      {},
      { scope: "full_file" },
    );

    expect(reverseResult.filterChain).toBe("areverse");
    expect(reverseResult.effectiveParameters).toEqual({});
    expect(monoResult.filterChain).toBe("pan=mono|c0=0.5*c0+0.5*c1");
    expect(monoResult.nextAudio.channels).toBe(1);
    expect(monoResult.nextAudio.channel_layout).toBe("mono");
  });

  it("normalizes channel_swap and stereo_balance_correction into explicit FFmpeg filters", () => {
    const swapped = buildOperation(
      createAudioVersion("storage/audio/source.wav").audio,
      "channel_swap",
      {},
      { scope: "full_file" },
    );
    const balanced = buildOperation(
      createAudioVersion("storage/audio/source.wav").audio,
      "stereo_balance_correction",
      {
        target_channel: "left",
        correction_db: 3,
      },
      { scope: "full_file" },
    );

    expect(swapped.filterChain).toBe("pan=stereo|c0=c1|c1=c0");
    expect(swapped.effectiveParameters).toEqual({});
    expect(balanced.filterChain).toBe("pan=stereo|c0=0.707946*c0|c1=1*c1");
    expect(balanced.effectiveParameters).toEqual({
      target_channel: "left",
      correction_db: 3,
    });
  });

  it("normalizes compressor parameters into an explicit FFmpeg filter", () => {
    const result = buildOperation(
      createAudioVersion("storage/audio/source.wav").audio,
      "compressor",
      {
        threshold_db: -18,
        ratio: 4,
        attack_ms: 10,
        release_ms: 120,
        knee_db: 3,
        makeup_gain_db: 3,
      },
      { scope: "full_file" },
    );

    expect(result.filterChain).toBe(
      "acompressor=level_in=1:mode=downward:threshold=0.125893:ratio=4:attack=10:release=120:makeup=1.412538:knee=1.412538:link=maximum:detection=rms:mix=1",
    );
    expect(result.effectiveParameters).toEqual({
      threshold_db: -18,
      ratio: 4,
      attack_ms: 10,
      release_ms: 120,
      knee_db: 3,
      makeup_gain_db: 3,
    });
  });

  it("normalizes limiter parameters into an explicit FFmpeg filter", () => {
    const result = buildOperation(
      createAudioVersion("storage/audio/source.wav").audio,
      "limiter",
      {
        ceiling_dbtp: -6,
        lookahead_ms: 5,
        release_ms: 50,
        input_gain_db: 0,
      },
      { scope: "full_file" },
    );

    expect(result.filterChain).toBe(
      "alimiter=level_in=1:level_out=1:limit=0.501187:attack=5:release=50:asc=false:asc_level=0.5:level=false:latency=true",
    );
    expect(result.effectiveParameters).toEqual({
      ceiling_dbtp: -6,
      lookahead_ms: 5,
      release_ms: 50,
      input_gain_db: 0,
    });
  });

  it("normalizes transient_shaper, clipper, and gate into explicit FFmpeg filters", () => {
    const transientShaper = buildOperation(
      createAudioVersion("storage/audio/source.wav").audio,
      "transient_shaper",
      {
        attack_amount_db: 5,
        threshold_db: -24,
        attack_ms: 3,
        release_ms: 90,
      },
      { scope: "full_file" },
    );
    const clipper = buildOperation(
      createAudioVersion("storage/audio/source.wav").audio,
      "clipper",
      {
        ceiling_dbfs: -9,
        input_gain_db: 6,
        output_gain_db: 0,
        oversample_factor: 4,
      },
      { scope: "full_file" },
    );
    const gate = buildOperation(
      createAudioVersion("storage/audio/source.wav").audio,
      "gate",
      {
        threshold_db: -36,
        range_db: 72,
        ratio: 10,
        attack_ms: 2,
        release_ms: 120,
      },
      { scope: "full_file" },
    );

    expect(transientShaper.filterChain).toBe(
      "compand=attacks=0.003:decays=0.09:points=-90/-90|-24/-24|0/5:soft-knee=1:gain=0:volume=0:delay=0.003",
    );
    expect(transientShaper.effectiveParameters).toEqual({
      attack_amount_db: 5,
      threshold_db: -24,
      attack_ms: 3,
      release_ms: 90,
    });

    expect(clipper.filterChain).toBe(
      "volume=6dB,apsyclip=level_in=1:level_out=1:clip=0.354813:adaptive=0.5:iterations=10:level=0",
    );
    expect(clipper.effectiveParameters).toEqual({
      ceiling_dbfs: -9,
      input_gain_db: 6,
      output_gain_db: 0,
      oversample_factor: 4,
    });

    expect(gate.filterChain).toBe(
      "agate=level_in=1:mode=downward:range=0.000251:threshold=0.015849:ratio=10:attack=2:release=120:makeup=1:knee=1:detection=rms:link=maximum",
    );
    expect(gate.effectiveParameters).toEqual({
      threshold_db: -36,
      range_db: 72,
      ratio: 10,
      attack_ms: 2,
      release_ms: 120,
    });
  });

  it("keeps explicit time-stretch ratio behavior working", () => {
    const result = buildOperation(
      createAudioVersion("storage/audio/source.wav").audio,
      "time_stretch",
      {
        stretch_ratio: 1.5,
      },
      { scope: "full_file" },
    );

    expect(result.filterChain).toBe("atempo=0.666667");
    expect(result.effectiveParameters).toEqual({
      stretch_ratio: 1.5,
      applied_tempo_ratio: 0.666667,
    });
    expect(result.nextAudio.duration_seconds).toBe(3);
    expect(result.nextAudio.frame_count).toBe(132300);
  });

  it("derives time-stretch ratio from source and target tempo", () => {
    const result = buildOperation(
      createRealAudioVersionFixtureAudio(1, 44100, 1),
      "time_stretch",
      {
        source_tempo_bpm: 120,
        target_tempo_bpm: 90,
      },
      { scope: "full_file" },
    );

    expect(result.filterChain).toBe("atempo=0.75");
    expect(result.effectiveParameters).toEqual({
      source_tempo_bpm: 120,
      target_tempo_bpm: 90,
      stretch_ratio: 1.333333,
      applied_tempo_ratio: 0.75,
    });
    expect(result.nextAudio.duration_seconds).toBe(1.333333);
    expect(result.nextAudio.frame_count).toBe(58800);
  });

  it("normalizes stereo width parameters into an explicit FFmpeg filter", () => {
    const result = buildOperation(
      createAudioVersion("storage/audio/source.wav").audio,
      "stereo_width",
      {
        width_multiplier: 1.18,
      },
      { scope: "full_file" },
    );

    expect(result.filterChain).toBe("extrastereo=m=1.18:c=false");
    expect(result.effectiveParameters).toEqual({
      width_multiplier: 1.18,
    });
  });

  it("normalizes denoise parameters into an explicit FFmpeg filter", () => {
    const result = buildOperation(
      createAudioVersion("storage/audio/source.wav").audio,
      "denoise",
      {
        reduction_db: 6,
        noise_floor_dbfs: -58,
      },
      { scope: "full_file" },
    );

    expect(result.filterChain).toBe("afftdn=nr=6:nf=-58:tn=0:tr=0:ad=0.5:fo=1:nl=min:om=o");
    expect(result.effectiveParameters).toEqual({
      reduction_db: 6,
      noise_floor_dbfs: -58,
    });
  });

  it("normalizes creative effect parameters into explicit FFmpeg filters", () => {
    const audio = createAudioVersion("storage/audio/source.wav").audio;

    const reverb = buildOperation(
      audio,
      "reverb",
      {
        pre_delay_ms: 12,
        reflection_spacing_ms: 18,
        tail_taps: 4,
        decay: 0.6,
        dry_mix: 0.82,
        wet_mix: 0.35,
      },
      { scope: "full_file" },
    );
    const delay = buildOperation(
      audio,
      "delay",
      {
        delay_ms: 120,
        dry_mix: 0.85,
        wet_mix: 0.35,
      },
      { scope: "full_file" },
    );
    const echo = buildOperation(
      audio,
      "echo",
      {
        delay_ms: 180,
        decay: 0.45,
        dry_mix: 0.8,
        wet_mix: 0.4,
      },
      { scope: "full_file" },
    );
    const bitcrush = buildOperation(
      audio,
      "bitcrush",
      {
        bit_depth: 6,
        sample_hold_samples: 12,
        mix: 0.75,
        mode: "log",
      },
      { scope: "full_file" },
    );
    const distortion = buildOperation(
      audio,
      "distortion",
      {
        drive_db: 18,
        threshold: 0.4,
        output_gain_db: -3,
        oversample_factor: 4,
      },
      { scope: "full_file" },
    );
    const saturation = buildOperation(
      audio,
      "saturation",
      {
        drive_db: 12,
        curve: "atan",
        output_gain_db: -2,
        oversample_factor: 4,
      },
      { scope: "full_file" },
    );
    const flanger = buildOperation(
      audio,
      "flanger",
      {
        delay_ms: 2.5,
        depth_ms: 4,
        feedback_percent: 30,
        mix_percent: 65,
        rate_hz: 0.8,
        waveform: "triangular",
      },
      { scope: "full_file" },
    );
    const phaser = buildOperation(
      audio,
      "phaser",
      {
        input_gain_db: -10,
        output_gain_db: -4,
        delay_ms: 2.5,
        decay: 0.5,
        rate_hz: 0.7,
        waveform: "sinusoidal",
      },
      { scope: "full_file" },
    );

    expect(reverb.filterChain).toBe(
      "aecho=0.82:0.35:12|30|48|66:0.6|0.432|0.31104|0.223949,atrim=end=2,asetpts=N/SR/TB",
    );
    expect(reverb.effectiveParameters).toEqual({
      pre_delay_ms: 12,
      reflection_spacing_ms: 18,
      tail_taps: 4,
      decay: 0.6,
      dry_mix: 0.82,
      wet_mix: 0.35,
      tap_delays_ms: [12, 30, 48, 66],
      tap_decays: [0.6, 0.432, 0.31104, 0.223949],
    });
    expect(delay.filterChain).toBe(
      "asplit=2[dry][wet];[wet]adelay=delays=120:all=1,volume=0.35[wetmix];[dry]volume=0.85[drymix];[drymix][wetmix]amix=inputs=2:normalize=0,atrim=end=2,asetpts=N/SR/TB",
    );
    expect(echo.filterChain).toBe("aecho=0.8:0.4:180:0.45,atrim=end=2,asetpts=N/SR/TB");
    expect(bitcrush.filterChain).toBe("acrusher=bits=6:samples=12:mix=0.75:mode=log:aa=1");
    expect(distortion.filterChain).toBe(
      "volume=18dB,asoftclip=type=hard:threshold=0.4:output=0.707946:param=1:oversample=4",
    );
    expect(saturation.filterChain).toBe(
      "volume=12dB,asoftclip=type=atan:threshold=1:output=0.794328:param=1:oversample=4",
    );
    expect(flanger.filterChain).toBe(
      "flanger=delay=2.5:depth=4:regen=30:width=65:speed=0.8:shape=triangular:phase=25:interp=linear",
    );
    expect(phaser.filterChain).toBe(
      "aphaser=in_gain=0.316228:out_gain=0.630957:delay=2.5:decay=0.5:speed=0.7:type=sinusoidal",
    );
  });

  it("normalizes pitch shift parameters into an explicit FFmpeg filter", () => {
    const result = buildOperation(
      createAudioVersion("storage/audio/source.wav").audio,
      "pitch_shift",
      {
        semitones: 12,
      },
      { scope: "full_file" },
    );

    expect(result.filterChain).toBe("asetrate=88200,aresample=44100,atempo=0.5");
    expect(result.effectiveParameters).toEqual({
      semitones: 12,
      pitch_ratio: 2,
      asetrate_hz: 88200,
      tempo_ratio: 0.5,
      atempo_factors: [0.5],
    });
  });

  it("rejects unsupported trim target scopes", () => {
    expect(() =>
      buildOperation(
        createAudioVersion("storage/audio/source.wav").audio,
        "trim",
        {},
        {
          scope: "channel",
          channel: "left",
        },
      ),
    ).toThrow(/full_file or time_range/);
  });

  it("rejects trim_silence requests that do not trim either edge", () => {
    expect(() =>
      buildOperation(
        createAudioVersion("storage/audio/source.wav").audio,
        "trim_silence",
        {
          threshold_dbfs: -48,
          trim_leading: false,
          trim_trailing: false,
        },
        { scope: "full_file" },
      ),
    ).toThrow(/requires trim_leading, trim_trailing, or both/);
  });

  it("rejects trim_silence window sizes outside the supported runtime range", () => {
    expect(() =>
      buildOperation(
        createAudioVersion("storage/audio/source.wav").audio,
        "trim_silence",
        {
          threshold_dbfs: -48,
          trim_leading: true,
          trim_trailing: true,
          window_seconds: 0.0005,
        },
        { scope: "full_file" },
      ),
    ).toThrow(/must be a finite number between 0.001 and 10/);
  });

  it("rejects fades that exceed the current audio duration", () => {
    expect(() =>
      buildOperation(createAudioVersion("storage/audio/source.wav").audio, "fade", {
        fade_in_seconds: 1.2,
        fade_out_seconds: 1.1,
      }),
    ).toThrow(/fit within the current audio duration/);
  });

  it("rejects unsupported compressor targets", () => {
    expect(() =>
      buildOperation(
        createAudioVersion("storage/audio/source.wav").audio,
        "compressor",
        {
          threshold_db: -18,
          ratio: 4,
          attack_ms: 10,
          release_ms: 120,
        },
        { scope: "channel", channel: "left" },
      ),
    ).toThrow(/full_file/);
  });

  it("rejects limiter ceilings above 0 dBFS", () => {
    expect(() =>
      buildOperation(
        createAudioVersion("storage/audio/source.wav").audio,
        "limiter",
        {
          ceiling_dbtp: 1,
          lookahead_ms: 5,
          release_ms: 50,
        },
        { scope: "full_file" },
      ),
    ).toThrow(/between -24 and 0/);
  });

  it("rejects invalid transient/control parameters", () => {
    expect(() =>
      buildOperation(
        createAudioVersion("storage/audio/source.wav").audio,
        "transient_shaper",
        {
          attack_amount_db: 20,
          threshold_db: -24,
        },
        { scope: "full_file" },
      ),
    ).toThrow(/attack_amount_db/);

    expect(() =>
      buildOperation(
        createAudioVersion("storage/audio/source.wav").audio,
        "clipper",
        {
          ceiling_dbfs: -9,
          oversample_factor: 2.5,
        },
        { scope: "full_file" },
      ),
    ).toThrow(/oversample_factor/);

    expect(() =>
      buildOperation(
        createAudioVersion("storage/audio/source.wav").audio,
        "gate",
        {
          threshold_db: -36,
          ratio: 1,
        },
        { scope: "full_file" },
      ),
    ).toThrow(/ratio/);
  });

  it("rejects time stretch parameters when ratio and tempo-match inputs are mixed", () => {
    expect(() =>
      buildOperation(
        createAudioVersion("storage/audio/source.wav").audio,
        "time_stretch",
        {
          stretch_ratio: 1.1,
          source_tempo_bpm: 120,
          target_tempo_bpm: 110,
        },
        { scope: "full_file" },
      ),
    ).toThrow(/either stretch_ratio or source_tempo_bpm \+ target_tempo_bpm, not both/);
  });

  it("rejects tempo-match inputs that derive an unsupported stretch ratio", () => {
    expect(() =>
      buildOperation(
        createAudioVersion("storage/audio/source.wav").audio,
        "time_stretch",
        {
          source_tempo_bpm: 300,
          target_tempo_bpm: 50,
        },
        { scope: "full_file" },
      ),
    ).toThrow(/derived stretch_ratio must be between 0.25 and 4/);
  });

  it("rejects stereo width for mono input", () => {
    expect(() =>
      buildOperation(
        {
          ...createAudioVersion("storage/audio/source.wav").audio,
          channels: 1,
          channel_layout: "mono",
        },
        "stereo_width",
        {
          width_multiplier: 1.2,
        },
        { scope: "full_file" },
      ),
    ).toThrow(/requires stereo 2-channel audio/);
  });

  it("rejects channel_swap for mono input", () => {
    expect(() =>
      buildOperation(
        {
          ...createAudioVersion("storage/audio/source.wav").audio,
          channels: 1,
          channel_layout: "mono",
        },
        "channel_swap",
        {},
        { scope: "full_file" },
      ),
    ).toThrow(/requires stereo 2-channel audio/);
  });

  it("rejects denoise noise floors above the supported range", () => {
    expect(() =>
      buildOperation(
        createAudioVersion("storage/audio/source.wav").audio,
        "denoise",
        {
          reduction_db: 6,
          noise_floor_dbfs: -10,
        },
        { scope: "full_file" },
      ),
    ).toThrow(/between -80 and -20/);
  });

  it("rejects pitch shifts outside the supported semitone range", () => {
    expect(() =>
      buildOperation(
        createAudioVersion("storage/audio/source.wav").audio,
        "pitch_shift",
        {
          semitones: 36,
        },
        { scope: "full_file" },
      ),
    ).toThrow(/between -24 and 24/);
  });
});

describe("applyOperation", () => {
  it("emits a contract-aligned output version and transform record", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createFixtureVersion(workspaceRoot);

    const result = await applyOperation({
      workspaceRoot,
      version,
      operation: "gain",
      parameters: { gain_db: 3 },
      outputVersionId: "ver_01HZX8G7J2V3M4N5P6Q7R8S9T0",
      recordId: "transform_01HZX8F7J2V3M4N5P6Q7R8S9T0",
      createdAt: new Date("2026-04-14T20:20:18Z"),
      executor: createFakeExecutor("gain"),
    });

    expect(result.outputVersion.audio.storage_ref).toBe(
      "storage/audio/ver_01HZX8G7J2V3M4N5P6Q7R8S9T0.wav",
    );
    expect(result.transformRecord.operations).toEqual([
      {
        operation: "gain",
        parameters: { gain_db: 3 },
        status: "applied",
      },
    ]);
    expect(
      await readFile(path.join(workspaceRoot, result.outputVersion.audio.storage_ref), "utf8"),
    ).toBe("gain-bytes");
    expect(validateAgainstSchema(audioVersionSchema, result.outputVersion)).toBe(true);
    expect(validateAgainstSchema(transformRecordSchema, result.transformRecord)).toBe(true);
  });

  it("rejects unsupported initial targets", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createFixtureVersion(workspaceRoot);

    await expect(
      applyOperation({
        workspaceRoot,
        version,
        operation: "gain",
        parameters: { gain_db: 1 },
        target: { scope: "channel", channel: "left" },
        executor: createFakeExecutor("bad"),
      }),
    ).rejects.toThrow(/full_file/);
  });

  it("applies a real compressor transform deterministically", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createRealAudioVersionFixture(workspaceRoot, {
      durationSeconds: 1,
      sampleRateHz: 44100,
      channels: 1,
      peakAmplitude: 30000,
    });

    const firstResult = await applyOperation({
      workspaceRoot,
      version,
      operation: "compressor",
      parameters: {
        threshold_db: -18,
        ratio: 4,
        attack_ms: 0.01,
        release_ms: 100,
        knee_db: 3,
      },
      outputVersionId: "ver_01HZY00000000000000000001",
      recordId: "transform_01HZY0000000000000000001",
      createdAt: new Date("2026-04-14T20:20:18Z"),
    });
    const secondResult = await applyOperation({
      workspaceRoot,
      version,
      operation: "compressor",
      parameters: {
        threshold_db: -18,
        ratio: 4,
        attack_ms: 0.01,
        release_ms: 100,
        knee_db: 3,
      },
      outputVersionId: "ver_01HZY00000000000000000002",
      recordId: "transform_01HZY0000000000000000002",
      createdAt: new Date("2026-04-14T20:20:18Z"),
    });

    const sourcePeakDbfs = await measurePeakLevelDbfs(
      path.join(workspaceRoot, version.audio.storage_ref),
    );
    const firstPeakDbfs = await measurePeakLevelDbfs(
      path.join(workspaceRoot, firstResult.outputVersion.audio.storage_ref),
    );
    const firstBytes = await readFile(
      path.join(workspaceRoot, firstResult.outputVersion.audio.storage_ref),
    );
    const secondBytes = await readFile(
      path.join(workspaceRoot, secondResult.outputVersion.audio.storage_ref),
    );

    expect(firstPeakDbfs).toBeLessThan(sourcePeakDbfs - 8);
    expect(firstBytes.equals(secondBytes)).toBe(true);
    expect(firstResult.transformRecord.operations).toEqual([
      {
        operation: "compressor",
        parameters: {
          threshold_db: -18,
          ratio: 4,
          attack_ms: 0.01,
          release_ms: 100,
          knee_db: 3,
          makeup_gain_db: 0,
        },
        status: "applied",
      },
    ]);
  });

  it("applies a real limiter transform that respects the configured ceiling", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createRealAudioVersionFixture(workspaceRoot, {
      durationSeconds: 1,
      sampleRateHz: 44100,
      channels: 1,
      peakAmplitude: 31000,
    });

    const result = await applyOperation({
      workspaceRoot,
      version,
      operation: "limiter",
      parameters: {
        ceiling_dbtp: -6,
        lookahead_ms: 5,
        release_ms: 80,
        input_gain_db: 0,
      },
      outputVersionId: "ver_01HZY00000000000000000003",
      recordId: "transform_01HZY0000000000000000003",
      createdAt: new Date("2026-04-14T20:20:18Z"),
    });

    const limitedPeakDbfs = await measurePeakLevelDbfs(
      path.join(workspaceRoot, result.outputVersion.audio.storage_ref),
    );

    expect(limitedPeakDbfs).toBeLessThanOrEqual(-5.7);
    expect(result.transformRecord.operations).toEqual([
      {
        operation: "limiter",
        parameters: {
          ceiling_dbtp: -6,
          lookahead_ms: 5,
          release_ms: 80,
          input_gain_db: 0,
        },
        status: "applied",
      },
    ]);
    expect(result.transformRecord.warnings).toBeUndefined();
  });

  it("applies transient/control transforms deterministically with expected dynamics changes", async () => {
    const transientWorkspaceRoot = await createWorkspace();
    const transientVersion = await createTransientFixture(transientWorkspaceRoot);

    const transientFirstResult = await applyOperation({
      workspaceRoot: transientWorkspaceRoot,
      version: transientVersion,
      operation: "transient_shaper",
      parameters: {
        attack_amount_db: 5,
        threshold_db: -24,
        attack_ms: 3,
        release_ms: 90,
      },
      outputVersionId: "ver_01HZY000000000000000000T1",
      recordId: "transform_01HZY00000000000000000T1",
      createdAt: new Date("2026-04-17T18:20:18Z"),
    });
    const transientSecondResult = await applyOperation({
      workspaceRoot: transientWorkspaceRoot,
      version: transientVersion,
      operation: "transient_shaper",
      parameters: {
        attack_amount_db: 5,
        threshold_db: -24,
        attack_ms: 3,
        release_ms: 90,
      },
      outputVersionId: "ver_01HZY000000000000000000T2",
      recordId: "transform_01HZY00000000000000000T2",
      createdAt: new Date("2026-04-17T18:20:18Z"),
    });

    const transientSourcePath = path.join(
      transientWorkspaceRoot,
      transientVersion.audio.storage_ref,
    );
    const transientOutputPath = path.join(
      transientWorkspaceRoot,
      transientFirstResult.outputVersion.audio.storage_ref,
    );
    const transientSourceCrest = await measurePeakToRmsDeltaDb(transientSourcePath);
    const transientOutputCrest = await measurePeakToRmsDeltaDb(transientOutputPath);
    const transientFirstBytes = await readFile(transientOutputPath);
    const transientSecondBytes = await readFile(
      path.join(transientWorkspaceRoot, transientSecondResult.outputVersion.audio.storage_ref),
    );

    expect(transientOutputCrest).toBeGreaterThan(transientSourceCrest + 0.7);
    expect(transientFirstBytes.equals(transientSecondBytes)).toBe(true);
    expect(transientFirstResult.transformRecord.operations).toEqual([
      {
        operation: "transient_shaper",
        parameters: {
          attack_amount_db: 5,
          threshold_db: -24,
          attack_ms: 3,
          release_ms: 90,
        },
        status: "applied",
      },
    ]);

    const clipperWorkspaceRoot = await createWorkspace();
    const clipperVersion = await createRealAudioVersionFixture(clipperWorkspaceRoot, {
      durationSeconds: 1,
      sampleRateHz: 44100,
      channels: 1,
      peakAmplitude: 26000,
    });
    const clipperResult = await applyOperation({
      workspaceRoot: clipperWorkspaceRoot,
      version: clipperVersion,
      operation: "clipper",
      parameters: {
        ceiling_dbfs: -9,
        input_gain_db: 8,
        output_gain_db: 0,
        oversample_factor: 4,
      },
      outputVersionId: "ver_01HZY000000000000000000T3",
      recordId: "transform_01HZY00000000000000000T3",
      createdAt: new Date("2026-04-17T18:20:18Z"),
    });

    const clippedPeakDbfs = await measurePeakLevelDbfs(
      path.join(clipperWorkspaceRoot, clipperResult.outputVersion.audio.storage_ref),
    );

    expect(clippedPeakDbfs).toBeLessThanOrEqual(-8.6);
    expect(clipperResult.transformRecord.operations).toEqual([
      {
        operation: "clipper",
        parameters: {
          ceiling_dbfs: -9,
          input_gain_db: 8,
          output_gain_db: 0,
          oversample_factor: 4,
        },
        status: "applied",
      },
    ]);

    const clipperPassThroughWorkspaceRoot = await createWorkspace();
    const clipperPassThroughVersion = await createRealAudioVersionFixture(
      clipperPassThroughWorkspaceRoot,
      {
        durationSeconds: 1,
        sampleRateHz: 44100,
        channels: 1,
        peakAmplitude: 3000,
      },
    );
    const clipperPassThroughSourcePeakDbfs = await measurePeakLevelDbfs(
      path.join(clipperPassThroughWorkspaceRoot, clipperPassThroughVersion.audio.storage_ref),
    );
    const clipperPassThroughResult = await applyOperation({
      workspaceRoot: clipperPassThroughWorkspaceRoot,
      version: clipperPassThroughVersion,
      operation: "clipper",
      parameters: {
        ceiling_dbfs: -9,
        input_gain_db: 0,
        output_gain_db: 0,
        oversample_factor: 4,
      },
      outputVersionId: "ver_01HZY000000000000000000T3B",
      recordId: "transform_01HZY0000000000000000T3B",
      createdAt: new Date("2026-04-17T18:20:18Z"),
    });
    const clipperPassThroughPeakDbfs = await measurePeakLevelDbfs(
      path.join(
        clipperPassThroughWorkspaceRoot,
        clipperPassThroughResult.outputVersion.audio.storage_ref,
      ),
    );

    expect(Math.abs(clipperPassThroughPeakDbfs - clipperPassThroughSourcePeakDbfs)).toBeLessThan(
      0.5,
    );

    const gateWorkspaceRoot = await createWorkspace();
    const gateVersion = await createNoisyAudioVersionFixture(gateWorkspaceRoot);
    const gateResult = await applyOperation({
      workspaceRoot: gateWorkspaceRoot,
      version: gateVersion,
      operation: "gate",
      parameters: {
        threshold_db: -36,
        range_db: 72,
        ratio: 10,
        attack_ms: 2,
        release_ms: 120,
      },
      outputVersionId: "ver_01HZY000000000000000000T4",
      recordId: "transform_01HZY00000000000000000T4",
      createdAt: new Date("2026-04-17T18:20:18Z"),
    });

    const gateSourcePath = path.join(gateWorkspaceRoot, gateVersion.audio.storage_ref);
    const gateOutputPath = path.join(gateWorkspaceRoot, gateResult.outputVersion.audio.storage_ref);
    const sourceNoiseRmsDb = await measureSegmentRmsLevelDb(gateSourcePath, 0, 0.2);
    const gatedNoiseRmsDb = await measureSegmentRmsLevelDb(gateOutputPath, 0, 0.2);
    const sourceToneRmsDb = await measureSegmentRmsLevelDb(gateSourcePath, 0.4, 0.8);
    const gatedToneRmsDb = await measureSegmentRmsLevelDb(gateOutputPath, 0.4, 0.8);

    expect(gatedNoiseRmsDb).toBeLessThan(sourceNoiseRmsDb - 10);
    expect(gatedToneRmsDb).toBeGreaterThan(sourceToneRmsDb - 3);
    expect(gateResult.transformRecord.operations).toEqual([
      {
        operation: "gate",
        parameters: {
          threshold_db: -36,
          range_db: 72,
          ratio: 10,
          attack_ms: 2,
          release_ms: 120,
        },
        status: "applied",
      },
    ]);
  });

  it("applies a real stereo width transform deterministically and increases side energy", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createStereoWidthFixture(workspaceRoot);

    const firstResult = await applyOperation({
      workspaceRoot,
      version,
      operation: "stereo_width",
      parameters: {
        width_multiplier: 1.5,
      },
      outputVersionId: "ver_01HZY00000000000000000004",
      recordId: "transform_01HZY0000000000000000004",
      createdAt: new Date("2026-04-14T20:20:18Z"),
    });
    const secondResult = await applyOperation({
      workspaceRoot,
      version,
      operation: "stereo_width",
      parameters: {
        width_multiplier: 1.5,
      },
      outputVersionId: "ver_01HZY00000000000000000005",
      recordId: "transform_01HZY0000000000000000005",
      createdAt: new Date("2026-04-14T20:20:18Z"),
    });

    const sourceWidth = await measureMidSideBalanceDb(
      path.join(workspaceRoot, version.audio.storage_ref),
    );
    const widenedWidth = await measureMidSideBalanceDb(
      path.join(workspaceRoot, firstResult.outputVersion.audio.storage_ref),
    );
    const firstBytes = await readFile(
      path.join(workspaceRoot, firstResult.outputVersion.audio.storage_ref),
    );
    const secondBytes = await readFile(
      path.join(workspaceRoot, secondResult.outputVersion.audio.storage_ref),
    );

    expect(widenedWidth.sideMinusMidDb).toBeGreaterThan(sourceWidth.sideMinusMidDb + 2.5);
    expect(firstBytes.equals(secondBytes)).toBe(true);
    expect(firstResult.transformRecord.operations).toEqual([
      {
        operation: "stereo_width",
        parameters: {
          width_multiplier: 1.5,
        },
        status: "applied",
      },
    ]);
  });

  it("applies a real tempo-match time stretch and records derived parameters", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createRealAudioVersionFixture(workspaceRoot, {
      durationSeconds: 1,
      sampleRateHz: 44100,
      channels: 1,
    });

    const result = await applyOperation({
      workspaceRoot,
      version,
      operation: "time_stretch",
      parameters: {
        source_tempo_bpm: 120,
        target_tempo_bpm: 90,
      },
      outputVersionId: "ver_01HZY00000000000000000011",
      recordId: "transform_01HZY0000000000000000011",
      createdAt: new Date("2026-04-14T20:20:18Z"),
    });

    const probed = await probeAudioMetadata(
      path.join(workspaceRoot, result.outputVersion.audio.storage_ref),
    );

    expect(result.transformRecord.operations).toEqual([
      {
        operation: "time_stretch",
        parameters: {
          source_tempo_bpm: 120,
          target_tempo_bpm: 90,
          stretch_ratio: 1.333333,
          applied_tempo_ratio: 0.75,
        },
        status: "applied",
      },
    ]);
    expect(result.outputVersion.audio.duration_seconds).toBe(1.333333);
    expect(result.outputVersion.audio.frame_count).toBe(58800);
    expect(probed.sampleRateHz).toBe(result.outputVersion.audio.sample_rate_hz);
    expect(probed.channels).toBe(result.outputVersion.audio.channels);
    expect(probed.durationSeconds).toBeGreaterThan(1.3);
    expect(probed.durationSeconds).toBeLessThan(1.34);
    expect(validateAgainstSchema(transformRecordSchema, result.transformRecord)).toBe(true);
  });

  it("applies a real denoise transform deterministically and reduces noise-only energy", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createNoisyAudioVersionFixture(workspaceRoot);

    const firstResult = await applyOperation({
      workspaceRoot,
      version,
      operation: "denoise",
      parameters: {
        reduction_db: 18,
        noise_floor_dbfs: -45,
      },
      outputVersionId: "ver_01HZY00000000000000000006",
      recordId: "transform_01HZY0000000000000000006",
      createdAt: new Date("2026-04-14T20:20:18Z"),
    });
    const secondResult = await applyOperation({
      workspaceRoot,
      version,
      operation: "denoise",
      parameters: {
        reduction_db: 18,
        noise_floor_dbfs: -45,
      },
      outputVersionId: "ver_01HZY00000000000000000007",
      recordId: "transform_01HZY0000000000000000007",
      createdAt: new Date("2026-04-14T20:20:18Z"),
    });

    const sourceNoiseRmsDb = await measureSegmentRmsLevelDb(
      path.join(workspaceRoot, version.audio.storage_ref),
      0,
      0.25,
    );
    const denoisedNoiseRmsDb = await measureSegmentRmsLevelDb(
      path.join(workspaceRoot, firstResult.outputVersion.audio.storage_ref),
      0,
      0.25,
    );
    const firstBytes = await readFile(
      path.join(workspaceRoot, firstResult.outputVersion.audio.storage_ref),
    );
    const secondBytes = await readFile(
      path.join(workspaceRoot, secondResult.outputVersion.audio.storage_ref),
    );

    expect(denoisedNoiseRmsDb).toBeLessThan(sourceNoiseRmsDb - 2);
    expect(firstBytes.equals(secondBytes)).toBe(true);
    expect(firstResult.transformRecord.operations).toEqual([
      {
        operation: "denoise",
        parameters: {
          reduction_db: 18,
          noise_floor_dbfs: -45,
        },
        status: "applied",
      },
    ]);
  });

  it("applies a real pitch shift deterministically and raises the dominant frequency", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createRealAudioVersionFixture(workspaceRoot, {
      durationSeconds: 1,
      sampleRateHz: 44100,
      channels: 1,
      peakAmplitude: 14000,
    });

    const firstResult = await applyOperation({
      workspaceRoot,
      version,
      operation: "pitch_shift",
      parameters: {
        semitones: 12,
      },
      outputVersionId: "ver_01HZY00000000000000000011",
      recordId: "transform_01HZY0000000000000000011",
      createdAt: new Date("2026-04-14T20:20:18Z"),
    });
    const secondResult = await applyOperation({
      workspaceRoot,
      version,
      operation: "pitch_shift",
      parameters: {
        semitones: 12,
      },
      outputVersionId: "ver_01HZY00000000000000000012",
      recordId: "transform_01HZY0000000000000000012",
      createdAt: new Date("2026-04-14T20:20:18Z"),
    });

    const sourceFrequencyHz = await measureDominantFrequencyHz(
      path.join(workspaceRoot, version.audio.storage_ref),
    );
    const shiftedFrequencyHz = await measureDominantFrequencyHz(
      path.join(workspaceRoot, firstResult.outputVersion.audio.storage_ref),
    );
    const shiftedMetadata = await probeAudioMetadata(
      path.join(workspaceRoot, firstResult.outputVersion.audio.storage_ref),
    );
    const firstBytes = await readFile(
      path.join(workspaceRoot, firstResult.outputVersion.audio.storage_ref),
    );
    const secondBytes = await readFile(
      path.join(workspaceRoot, secondResult.outputVersion.audio.storage_ref),
    );

    expect(shiftedFrequencyHz).toBeGreaterThan(sourceFrequencyHz * 1.9);
    expect(shiftedFrequencyHz).toBeLessThan(sourceFrequencyHz * 2.1);
    expect(shiftedMetadata.durationSeconds).toBeCloseTo(version.audio.duration_seconds, 1);
    expect(shiftedMetadata.sampleRateHz).toBe(version.audio.sample_rate_hz);
    expect(shiftedMetadata.channels).toBe(version.audio.channels);
    expect(firstBytes.equals(secondBytes)).toBe(true);
    expect(firstResult.transformRecord.operations).toEqual([
      {
        operation: "pitch_shift",
        parameters: {
          semitones: 12,
          pitch_ratio: 2,
          asetrate_hz: 88200,
          tempo_ratio: 0.5,
          atempo_factors: [0.5],
        },
        status: "applied",
      },
    ]);
  });

  it("applies a real trim_silence transform and updates output metadata from the rendered file", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createSilencePaddedAudioVersionFixture(workspaceRoot);

    const result = await applyOperation({
      workspaceRoot,
      version,
      operation: "trim_silence",
      parameters: {
        threshold_dbfs: -45,
        trim_leading: true,
        trim_trailing: true,
        window_seconds: 0.02,
      },
      outputVersionId: "ver_01HZY00000000000000000013",
      recordId: "transform_01HZY0000000000000000013",
      createdAt: new Date("2026-04-14T20:20:18Z"),
    });

    const outputPath = path.join(workspaceRoot, result.outputVersion.audio.storage_ref);
    const probed = await probeAudioMetadata(outputPath);

    expect(result.outputVersion.audio.duration_seconds).toBeLessThan(
      version.audio.duration_seconds,
    );
    expect(result.outputVersion.audio.duration_seconds).toBeCloseTo(probed.durationSeconds, 3);
    expect(result.transformRecord.operations).toEqual([
      {
        operation: "trim_silence",
        parameters: expect.objectContaining({
          threshold_dbfs: -45,
          trim_leading: true,
          trim_trailing: true,
          window_seconds: 0.02,
        }),
        status: "applied",
      },
    ]);
    expect(
      Number(result.transformRecord.operations[0]?.parameters.trimmed_duration_seconds ?? 0),
    ).toBeGreaterThan(0.1);
  });

  it("applies reverse, mono_sum, channel_swap, and stereo_balance_correction deterministically", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createAsymmetricStereoFixture(workspaceRoot);
    const sourcePath = path.join(workspaceRoot, version.audio.storage_ref);
    const sourceSamples = await readWaveSamples(sourcePath);

    const reverseResult = await applyOperation({
      workspaceRoot,
      version,
      operation: "reverse",
      parameters: {},
      outputVersionId: "ver_01HZY00000000000000000014",
      recordId: "transform_01HZY0000000000000000014",
      createdAt: new Date("2026-04-14T20:20:18Z"),
    });
    const monoResult = await applyOperation({
      workspaceRoot,
      version,
      operation: "mono_sum",
      parameters: {},
      outputVersionId: "ver_01HZY00000000000000000015",
      recordId: "transform_01HZY0000000000000000015",
      createdAt: new Date("2026-04-14T20:20:18Z"),
    });
    const swapResult = await applyOperation({
      workspaceRoot,
      version,
      operation: "channel_swap",
      parameters: {},
      outputVersionId: "ver_01HZY00000000000000000016",
      recordId: "transform_01HZY0000000000000000016",
      createdAt: new Date("2026-04-14T20:20:18Z"),
    });
    const balanceResult = await applyOperation({
      workspaceRoot,
      version,
      operation: "stereo_balance_correction",
      parameters: {
        target_channel: "left",
        correction_db: 6,
      },
      outputVersionId: "ver_01HZY00000000000000000017",
      recordId: "transform_01HZY0000000000000000017",
      createdAt: new Date("2026-04-14T20:20:18Z"),
    });

    const reverseSamples = await readWaveSamples(
      path.join(workspaceRoot, reverseResult.outputVersion.audio.storage_ref),
    );
    const monoSamples = await readWaveSamples(
      path.join(workspaceRoot, monoResult.outputVersion.audio.storage_ref),
    );
    const swappedSamples = await readWaveSamples(
      path.join(workspaceRoot, swapResult.outputVersion.audio.storage_ref),
    );
    const balancedSamples = await readWaveSamples(
      path.join(workspaceRoot, balanceResult.outputVersion.audio.storage_ref),
    );

    expect(reverseSamples[0]?.[0]).toBe(sourceSamples[0]?.at(-1));
    expect(reverseSamples[1]?.[0]).toBe(sourceSamples[1]?.at(-1));
    expect(monoResult.outputVersion.audio.channels).toBe(1);
    expect(monoResult.outputVersion.audio.channel_layout).toBe("mono");
    expect(monoSamples[0]?.[100]).toBeCloseTo(
      ((sourceSamples[0]?.[100] ?? 0) + (sourceSamples[1]?.[100] ?? 0)) / 2,
      0,
    );
    expect(swappedSamples[0]?.[200]).toBe(sourceSamples[1]?.[200]);
    expect(swappedSamples[1]?.[200]).toBe(sourceSamples[0]?.[200]);
    expect(computeChannelRms(balancedSamples[0] ?? [])).toBeLessThan(
      computeChannelRms(sourceSamples[0] ?? []) * 0.65,
    );
    expect(computeChannelRms(balancedSamples[1] ?? [])).toBeCloseTo(
      computeChannelRms(sourceSamples[1] ?? []),
      0,
    );
  });

  it("allows trim_silence to collapse fully silent files to zero duration", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createSilentAudioVersionFixture(workspaceRoot);

    const result = await applyOperation({
      workspaceRoot,
      version,
      operation: "trim_silence",
      parameters: {
        threshold_dbfs: -45,
        trim_leading: true,
        trim_trailing: true,
        window_seconds: 0.02,
      },
      outputVersionId: "ver_01HZY00000000000000000012",
      recordId: "transform_01HZY0000000000000000012",
      createdAt: new Date("2026-04-14T20:20:18Z"),
    });

    expect(result.outputVersion.audio.duration_seconds).toBe(0);
    expect(result.outputVersion.audio.frame_count).toBe(0);
    expect(result.transformRecord.operations).toEqual([
      {
        operation: "trim_silence",
        parameters: expect.objectContaining({
          result_duration_seconds: 0,
          trimmed_duration_seconds: version.audio.duration_seconds,
        }),
        status: "applied",
      },
    ]);
  });

  it("applies creative effects deterministically without changing clip duration", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createRealAudioVersionFixture(workspaceRoot, {
      durationSeconds: 1,
      sampleRateHz: 44100,
      channels: 1,
      peakAmplitude: 12000,
    });
    const sourcePath = path.join(workspaceRoot, version.audio.storage_ref);
    const sourceSamples = await readWaveSamples(sourcePath);

    const operations = [
      {
        operation: "reverb" as const,
        parameters: {
          pre_delay_ms: 8,
          reflection_spacing_ms: 16,
          tail_taps: 4,
          decay: 0.55,
          dry_mix: 0.82,
          wet_mix: 0.32,
        },
      },
      {
        operation: "delay" as const,
        parameters: {
          delay_ms: 140,
          dry_mix: 0.84,
          wet_mix: 0.35,
        },
      },
      {
        operation: "echo" as const,
        parameters: {
          delay_ms: 180,
          decay: 0.42,
          dry_mix: 0.78,
          wet_mix: 0.38,
        },
      },
      {
        operation: "bitcrush" as const,
        parameters: {
          bit_depth: 6,
          sample_hold_samples: 10,
          mix: 0.8,
          mode: "log",
        },
      },
      {
        operation: "distortion" as const,
        parameters: {
          drive_db: 18,
          threshold: 0.42,
          output_gain_db: -6,
          oversample_factor: 2,
        },
      },
      {
        operation: "saturation" as const,
        parameters: {
          drive_db: 10,
          curve: "atan",
          output_gain_db: -3,
          oversample_factor: 2,
        },
      },
      {
        operation: "flanger" as const,
        parameters: {
          delay_ms: 2.2,
          depth_ms: 2.8,
          feedback_percent: 25,
          mix_percent: 60,
          rate_hz: 0.7,
          waveform: "sinusoidal",
        },
      },
      {
        operation: "phaser" as const,
        parameters: {
          input_gain_db: -10,
          output_gain_db: -4,
          delay_ms: 2.2,
          decay: 0.45,
          rate_hz: 0.6,
          waveform: "triangular",
        },
      },
    ];

    for (const [index, item] of operations.entries()) {
      const result = await applyOperation({
        workspaceRoot,
        version,
        operation: item.operation,
        parameters: item.parameters,
        outputVersionId: `ver_01HZYCREATIVE00000000000${index + 1}`,
        recordId: `transform_01HZYCREATIVE0000000000${index + 1}`,
        createdAt: new Date("2026-04-17T12:00:00Z"),
      });
      const outputPath = path.join(workspaceRoot, result.outputVersion.audio.storage_ref);
      const probed = await probeAudioMetadata(outputPath);
      const outputSamples = await readWaveSamples(outputPath);

      expect(result.outputVersion.audio.duration_seconds).toBe(version.audio.duration_seconds);
      expect(probed.durationSeconds).toBeCloseTo(version.audio.duration_seconds, 3);
      expect(result.transformRecord.operations).toEqual([
        {
          operation: item.operation,
          parameters: expect.any(Object),
          status: "applied",
        },
      ]);
      expect(
        computeAverageAbsoluteDifference(sourceSamples[0] ?? [], outputSamples[0] ?? []),
      ).toBeGreaterThan(minimumAverageDifferenceForOperation(item.operation));
    }
  });
});

describe("applyEditPlan", () => {
  it("executes ordered steps and materializes the final plan output", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createFixtureVersion(workspaceRoot);
    const plan: EditPlan = {
      schema_version: "1.0.0",
      plan_id: "plan_01HZX8E7J2V3M4N5P6Q7R8S9T0",
      capability_manifest_id: "capmanifest_20260417A",
      asset_id: version.asset_id,
      version_id: version.version_id,
      user_request: "Trim, soften edges, and reduce level slightly.",
      goals: ["shorten the clip", "avoid abrupt boundaries"],
      created_at: "2026-04-14T20:20:15Z",
      steps: [
        {
          step_id: "step_trim_1",
          operation: "trim",
          target: { scope: "time_range", start_seconds: 0.2, end_seconds: 1.2 },
          parameters: {},
          expected_effects: ["shorten the clip"],
          safety_limits: ["preserve one second of material"],
        },
        {
          step_id: "step_fade_1",
          operation: "fade",
          target: { scope: "full_file" },
          parameters: { fade_in_seconds: 0.05, fade_out_seconds: 0.1 },
          expected_effects: ["smooth boundaries"],
          safety_limits: ["keep fades short"],
        },
      ],
    };

    const result = await applyEditPlan({
      workspaceRoot,
      version,
      plan,
      outputVersionId: "ver_01HZX8G7J2V3M4N5P6Q7R8S9T0",
      recordId: "transform_01HZX8F7J2V3M4N5P6Q7R8S9T0",
      createdAt: new Date("2026-04-14T20:20:18Z"),
      executor: createFakeExecutor("plan"),
    });

    expect(result.commands).toHaveLength(2);
    expect(result.commands[0]?.outputPath.endsWith(".step-1.wav")).toBe(true);
    expect(result.commands[1]?.outputPath.endsWith("ver_01HZX8G7J2V3M4N5P6Q7R8S9T0.wav")).toBe(
      true,
    );
    expect(result.transformRecord.operations.map((operation) => operation.operation)).toEqual([
      "trim",
      "fade",
    ]);
    expect(result.outputVersion.audio.duration_seconds).toBe(1);
    expect(result.outputVersion.audio.frame_count).toBe(44100);
    expect(result.outputVersion.lineage.plan_id).toBe(plan.plan_id);
    expect(validateAgainstSchema(audioVersionSchema, result.outputVersion)).toBe(true);
    expect(validateAgainstSchema(transformRecordSchema, result.transformRecord)).toBe(true);
  });

  it("preflights later steps before execution so invalid stereo ops do not partially run", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createFixtureVersion(workspaceRoot);
    const plan: EditPlan = {
      schema_version: "1.0.0",
      plan_id: "plan_01HZY2INVALID000000000001",
      capability_manifest_id: "capmanifest_20260417A",
      asset_id: version.asset_id,
      version_id: version.version_id,
      user_request: "Collapse to mono, then widen it.",
      goals: ["collapse to mono", "widen image"],
      created_at: "2026-04-14T20:20:15Z",
      steps: [
        {
          step_id: "step_mono_1",
          operation: "mono_sum",
          target: { scope: "full_file" },
          parameters: {},
          expected_effects: ["collapse image"],
          safety_limits: ["keep it deterministic"],
        },
        {
          step_id: "step_width_1",
          operation: "stereo_width",
          target: { scope: "full_file" },
          parameters: { width_multiplier: 1.1 },
          expected_effects: ["widen image"],
          safety_limits: ["stay within supported surface"],
        },
      ],
    };
    let executionCount = 0;

    await expect(() =>
      applyEditPlan({
        workspaceRoot,
        version,
        plan,
        executor: async (command) => {
          executionCount += 1;
          await writeFile(command.outputPath, "unexpected");
          return {
            exitCode: 0,
            stdout: "",
            stderr: "",
          };
        },
      }),
    ).rejects.toThrow(/requires stereo 2-channel audio/);

    expect(executionCount).toBe(0);
  });

  it("applies a real trim transform that matches the emitted duration metadata", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createRealAudioVersionFixture(workspaceRoot, {
      durationSeconds: 1,
      sampleRateHz: 44100,
      channels: 1,
    });

    const result = await applyOperation({
      workspaceRoot,
      version,
      operation: "trim",
      parameters: { start_seconds: 0.2, end_seconds: 0.7 },
      outputVersionId: "ver_01HZX8G7J2V3M4N5P6Q7R8S9T0",
      recordId: "transform_01HZX8F7J2V3M4N5P6Q7R8S9T0",
      createdAt: new Date("2026-04-14T20:20:18Z"),
    });

    const probed = await probeAudioMetadata(
      path.join(workspaceRoot, result.outputVersion.audio.storage_ref),
    );

    expect(result.outputVersion.audio.duration_seconds).toBe(0.5);
    expect(result.outputVersion.audio.frame_count).toBe(22050);
    expect(probed.sampleRateHz).toBe(result.outputVersion.audio.sample_rate_hz);
    expect(probed.channels).toBe(result.outputVersion.audio.channels);
    expect(probed.durationSeconds).toBeCloseTo(result.outputVersion.audio.duration_seconds, 3);
    expect(result.transformRecord.warnings).toBeUndefined();
  });
});

describe("extractSlice and extractSlices", () => {
  it("extracts one explicit slice and preserves clear derived lineage", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createRealAudioVersionFixture(workspaceRoot, {
      durationSeconds: 2,
      sampleRateHz: 44100,
      channels: 1,
    });

    const result = await extractSlice({
      workspaceRoot,
      version,
      slice: {
        slice_id: "slice_intro",
        start_seconds: 0.25,
        end_seconds: 1.25,
      },
      outputVersionId: "ver_01HZY00000000000000000008",
      recordId: "transform_01HZY0000000000000000008",
      createdAt: new Date("2026-04-14T20:20:18Z"),
    });

    const probed = await probeAudioMetadata(
      path.join(workspaceRoot, result.outputVersion.audio.storage_ref),
    );

    expect(result.source_range).toEqual({
      start_seconds: 0.25,
      end_seconds: 1.25,
      duration_seconds: 1,
    });
    expect(result.commands).toHaveLength(1);
    expect(result.outputVersion.audio.duration_seconds).toBe(1);
    expect(result.outputVersion.audio.frame_count).toBe(44100);
    expect(result.outputVersion.lineage.reason).toContain("slice extraction #1 (slice_intro)");
    expect(result.transformRecord.slice_id).toBe("slice_intro");
    expect(result.transformRecord.operations).toEqual([
      {
        operation: "slice_extract",
        parameters: {
          slice_id: "slice_intro",
          slice_index: 0,
          start_seconds: 0.25,
          end_seconds: 1.25,
          duration_seconds: 1,
        },
        status: "applied",
      },
    ]);
    expect(probed.durationSeconds).toBeCloseTo(1, 3);
    expect(validateAgainstSchema(audioVersionSchema, result.outputVersion)).toBe(true);
  });

  it("derives a contract-aligned slice map from transient markers", async () => {
    const version: AudioVersion = {
      ...createAudioVersion("storage/audio/source.wav"),
      audio: {
        ...createAudioVersion("storage/audio/source.wav").audio,
        duration_seconds: 2,
        frame_count: 88200,
      },
    };

    const sliceMap = deriveSliceMapFromTransients({
      version,
      transientMap: {
        schema_version: "1.0.0",
        transient_map_id: "transientmap_01HZY0000000000000000001",
        asset_id: version.asset_id,
        version_id: version.version_id,
        generated_at: "2026-04-14T20:20:18Z",
        detector: {
          name: "default-analysis",
          version: "0.1.2",
        },
        transients: [
          { time_seconds: 0.25, strength: 0.82, confidence: 0.8, kind: "transient" },
          { time_seconds: 0.75, strength: 0.77, confidence: 0.74, kind: "transient" },
        ],
      },
    });

    expect(sliceMap.source_transient_map_id).toBe("transientmap_01HZY0000000000000000001");
    expect(sliceMap.slices).toEqual([
      {
        slice_id: "slice_001",
        start_seconds: 0.25,
        end_seconds: 0.75,
        peak_time_seconds: 0.25,
        confidence: 0.8,
      },
      {
        slice_id: "slice_002",
        start_seconds: 0.75,
        end_seconds: 2,
        peak_time_seconds: 0.75,
        confidence: 0.74,
      },
    ]);
  });

  it("extracts slices from a contract-aligned slice map", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createFixtureVersion(workspaceRoot);

    const result = await extractSlices({
      workspaceRoot,
      version,
      sliceMap: {
        schema_version: "1.0.0",
        slice_map_id: "slicemap_01HZY0000000000000000001",
        asset_id: version.asset_id,
        version_id: version.version_id,
        generated_at: "2026-04-14T20:20:18Z",
        slicer: {
          name: "transient-slice-builder",
          version: "0.1.0",
        },
        slices: [
          { slice_id: "a_intro", start_seconds: 0.25, end_seconds: 0.75 },
          { slice_id: "z_outro", start_seconds: 1, end_seconds: 1.5 },
        ],
      },
      outputVersionIds: ["ver_01HZY00000000000000000009", "ver_01HZY00000000000000000010"],
      recordIds: ["transform_01HZY0000000000000000009", "transform_01HZY0000000000000000010"],
      createdAt: new Date("2026-04-14T20:20:18Z"),
      executor: createFakeExecutor("slice"),
    });

    expect(result.outputs.map((output) => output.slice_id)).toEqual(["a_intro", "z_outro"]);
    expect(
      result.outputs[0]?.commands[0]?.outputPath.endsWith("ver_01HZY00000000000000000009.wav"),
    ).toBe(true);
    expect(result.outputs[1]?.transformRecord.slice_index).toBe(1);
    expect(result.outputs[0]?.source_range).toEqual({
      start_seconds: 0.25,
      end_seconds: 0.75,
      duration_seconds: 0.5,
    });
    const firstOutput = result.outputs[0];
    if (firstOutput === undefined) {
      throw new Error("Expected the first slice output to exist.");
    }
    expect(
      await readFile(path.join(workspaceRoot, firstOutput.outputVersion.audio.storage_ref), "utf8"),
    ).toBe("slice-bytes");
  });

  it("rejects invalid slice boundaries before executing anything", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createFixtureVersion(workspaceRoot);
    let executions = 0;

    await expect(
      extractSlices({
        workspaceRoot,
        version,
        slices: [
          {
            slice_id: "bad_slice",
            start_seconds: 1.1,
            end_seconds: 1.1,
          },
        ],
        executor: async (command) => {
          executions += 1;
          await writeFile(command.outputPath, "should-not-run");
          return {
            exitCode: 0,
            stdout: "",
            stderr: "",
          };
        },
      }),
    ).rejects.toThrow(/greater than start_seconds/);

    expect(executions).toBe(0);
  });
});

describe("resolveTransformOutputPath", () => {
  it("keeps transform outputs workspace-relative", async () => {
    const workspaceRoot = await createWorkspace();
    const result = resolveTransformOutputPath({
      workspaceRoot,
      versionId: "ver_abc123",
    });

    expect(result.relativePath).toBe("storage/audio/ver_abc123.wav");
    expect(result.absolutePath).toBe(
      path.join(workspaceRoot, "storage", "audio", "ver_abc123.wav"),
    );
  });
});

async function createWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "transforms-module-"));
  tempDirs.push(workspaceRoot);
  return workspaceRoot;
}

async function createFixtureVersion(workspaceRoot: string): Promise<AudioVersion> {
  const storageRef = "storage/audio/source.wav";
  await mkdir(path.dirname(path.join(workspaceRoot, storageRef)), { recursive: true });
  await writeFile(path.join(workspaceRoot, storageRef), "source-bytes", { flag: "w" });

  return createAudioVersion(storageRef);
}

async function createRealAudioVersionFixture(
  workspaceRoot: string,
  options: {
    durationSeconds: number;
    sampleRateHz: number;
    channels: number;
    peakAmplitude?: number;
  },
): Promise<AudioVersion> {
  const storageRef = "storage/audio/source.wav";
  const absolutePath = path.join(workspaceRoot, storageRef);
  await mkdir(path.dirname(absolutePath), { recursive: true });

  const totalFrames = Math.round(options.durationSeconds * options.sampleRateHz);
  const peakAmplitude = options.peakAmplitude ?? 16000;
  const samples = Array.from({ length: options.channels }, () =>
    Array.from({ length: totalFrames }, (_, index) =>
      Math.round(Math.sin((2 * Math.PI * 440 * index) / options.sampleRateHz) * peakAmplitude),
    ),
  );
  const wav = new WaveFile();
  wav.fromScratch(options.channels, options.sampleRateHz, "16", samples);
  await writeFile(absolutePath, Buffer.from(wav.toBuffer()));

  return {
    ...createAudioVersion(storageRef),
    audio: {
      storage_ref: storageRef,
      sample_rate_hz: options.sampleRateHz,
      channels: options.channels,
      duration_seconds: options.durationSeconds,
      frame_count: totalFrames,
      ...(options.channels === 1 ? { channel_layout: "mono" } : { channel_layout: "stereo" }),
    },
  };
}

async function createStereoWidthFixture(workspaceRoot: string): Promise<AudioVersion> {
  const sampleRateHz = 44100;
  const durationSeconds = 1;
  const totalFrames = Math.round(durationSeconds * sampleRateHz);
  const left = Array.from({ length: totalFrames }, (_, index) => {
    const mid = Math.sin((2 * Math.PI * 220 * index) / sampleRateHz) * 10000;
    const side = Math.sin((2 * Math.PI * 660 * index) / sampleRateHz) * 4000;
    return Math.round(mid + side);
  });
  const right = Array.from({ length: totalFrames }, (_, index) => {
    const mid = Math.sin((2 * Math.PI * 220 * index) / sampleRateHz) * 10000;
    const side = Math.sin((2 * Math.PI * 660 * index) / sampleRateHz) * 4000;
    return Math.round(mid - side);
  });

  return createCustomAudioVersionFixture(workspaceRoot, {
    sampleRateHz,
    channels: 2,
    channelLayout: "stereo",
    samples: [left, right],
  });
}

async function createAsymmetricStereoFixture(workspaceRoot: string): Promise<AudioVersion> {
  const sampleRateHz = 44100;
  const durationSeconds = 1;
  const totalFrames = Math.round(durationSeconds * sampleRateHz);
  const left = Array.from({ length: totalFrames }, (_, index) =>
    Math.round(Math.sin((2 * Math.PI * 220 * index) / sampleRateHz) * 14000),
  );
  const right = Array.from({ length: totalFrames }, (_, index) =>
    Math.round(Math.sin((2 * Math.PI * 440 * index) / sampleRateHz) * 7000),
  );

  return createCustomAudioVersionFixture(workspaceRoot, {
    sampleRateHz,
    channels: 2,
    channelLayout: "stereo",
    samples: [left, right],
  });
}

async function createNoisyAudioVersionFixture(workspaceRoot: string): Promise<AudioVersion> {
  const sampleRateHz = 44100;
  const durationSeconds = 1;
  const totalFrames = Math.round(durationSeconds * sampleRateHz);
  let state = 1337;
  const noise = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967295;
  };
  const mono = Array.from({ length: totalFrames }, (_, index) => {
    const noiseAmplitude = index < sampleRateHz * 0.25 ? 220 : 160;
    const noiseSample = (noise() * 2 - 1) * noiseAmplitude;
    const toneSample =
      index < sampleRateHz * 0.25 ? 0 : Math.sin((2 * Math.PI * 440 * index) / sampleRateHz) * 9000;
    return Math.round(toneSample + noiseSample);
  });

  return createCustomAudioVersionFixture(workspaceRoot, {
    sampleRateHz,
    channels: 1,
    channelLayout: "mono",
    samples: [mono],
  });
}

async function createTransientFixture(workspaceRoot: string): Promise<AudioVersion> {
  const sampleRateHz = 44100;
  const durationSeconds = 1;
  const totalFrames = Math.round(durationSeconds * sampleRateHz);
  const mono = Array.from({ length: totalFrames }, (_, index) => {
    const timeSeconds = index / sampleRateHz;
    const cyclePosition = timeSeconds % 0.25;
    const sustain = Math.sin((2 * Math.PI * 220 * index) / sampleRateHz) * 2200;
    const transientEnvelope =
      cyclePosition < 0.008 ? Math.sin((Math.PI * cyclePosition) / 0.008) : 0;
    const transient = transientEnvelope * 15000;
    return Math.round(sustain + transient);
  });

  return createCustomAudioVersionFixture(workspaceRoot, {
    sampleRateHz,
    channels: 1,
    channelLayout: "mono",
    samples: [mono],
  });
}

async function createSilencePaddedAudioVersionFixture(
  workspaceRoot: string,
): Promise<AudioVersion> {
  const sampleRateHz = 44100;
  const totalFrames = sampleRateHz;
  const leadingSilenceFrames = Math.round(sampleRateHz * 0.1);
  const trailingSilenceFrames = Math.round(sampleRateHz * 0.12);
  const activeFrames = totalFrames - leadingSilenceFrames - trailingSilenceFrames;
  const mono = Array.from({ length: totalFrames }, (_, index) => {
    if (index < leadingSilenceFrames || index >= leadingSilenceFrames + activeFrames) {
      return 0;
    }

    const activeIndex = index - leadingSilenceFrames;
    return Math.round(Math.sin((2 * Math.PI * 330 * activeIndex) / sampleRateHz) * 10000);
  });

  return createCustomAudioVersionFixture(workspaceRoot, {
    sampleRateHz,
    channels: 1,
    channelLayout: "mono",
    samples: [mono],
  });
}

async function createSilentAudioVersionFixture(workspaceRoot: string): Promise<AudioVersion> {
  const sampleRateHz = 44100;
  const totalFrames = sampleRateHz;
  const mono = Array.from({ length: totalFrames }, () => 0);

  return createCustomAudioVersionFixture(workspaceRoot, {
    sampleRateHz,
    channels: 1,
    channelLayout: "mono",
    samples: [mono],
  });
}

async function createCustomAudioVersionFixture(
  workspaceRoot: string,
  options: {
    sampleRateHz: number;
    channels: number;
    channelLayout: string;
    samples: number[][];
  },
): Promise<AudioVersion> {
  const storageRef = "storage/audio/source.wav";
  const absolutePath = path.join(workspaceRoot, storageRef);
  const frameCount = options.samples[0]?.length;

  if (frameCount === undefined) {
    throw new Error("Custom audio fixtures require at least one channel of sample data.");
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });

  const wav = new WaveFile();
  wav.fromScratch(options.channels, options.sampleRateHz, "16", options.samples);
  await writeFile(absolutePath, Buffer.from(wav.toBuffer()));

  return {
    ...createAudioVersion(storageRef),
    audio: {
      storage_ref: storageRef,
      sample_rate_hz: options.sampleRateHz,
      channels: options.channels,
      duration_seconds: frameCount / options.sampleRateHz,
      frame_count: frameCount,
      channel_layout: options.channelLayout,
    },
  };
}

function createAudioVersion(storageRef: string): AudioVersion {
  return {
    schema_version: "1.0.0",
    version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T0",
    asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T0",
    lineage: {
      created_at: "2026-04-14T20:20:05Z",
      created_by: "modules/io",
      reason: "fixture",
    },
    audio: {
      storage_ref: storageRef,
      sample_rate_hz: 44100,
      channels: 2,
      duration_seconds: 2,
      frame_count: 88200,
      channel_layout: "stereo",
    },
    state: {
      is_original: true,
      is_preview: false,
    },
  };
}

function createRealAudioVersionFixtureAudio(
  durationSeconds: number,
  sampleRateHz: number,
  channels: number,
): AudioVersion["audio"] {
  return {
    ...createAudioVersion("storage/audio/source.wav").audio,
    sample_rate_hz: sampleRateHz,
    channels,
    duration_seconds: durationSeconds,
    frame_count: Math.round(durationSeconds * sampleRateHz),
    ...(channels === 1 ? { channel_layout: "mono" } : { channel_layout: "stereo" }),
  };
}

function createFakeExecutor(
  label: string,
): (command: FfmpegCommand) => Promise<FfmpegExecutionResult> {
  return async (command) => {
    await writeFile(command.outputPath, `${label}-bytes`);

    return {
      exitCode: 0,
      stdout: `${label} stdout`,
      stderr: "",
    };
  };
}

async function probeAudioMetadata(absolutePath: string): Promise<{
  sampleRateHz: number;
  channels: number;
  durationSeconds: number;
}> {
  const { stdout } = await execFile("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=sample_rate,channels",
    "-of",
    "json",
    absolutePath,
  ]);
  const payload = JSON.parse(stdout) as {
    streams?: Array<{ sample_rate?: string; channels?: number }>;
    format?: { duration?: string };
  };
  const stream = payload.streams?.[0];

  return {
    sampleRateHz: Number(stream?.sample_rate),
    channels: Number(stream?.channels),
    durationSeconds: Number(payload.format?.duration),
  };
}

async function readWaveSamples(absolutePath: string): Promise<Int16Array[]> {
  const wav = new WaveFile(await readFile(absolutePath));
  const samples = wav.getSamples(false, Int16Array);

  if (!Array.isArray(samples)) {
    return [Int16Array.from(samples as unknown as ArrayLike<number>)];
  }

  const channels = samples as unknown as ArrayLike<number>[];
  return channels.map((channel) => Int16Array.from(channel));
}

async function measurePeakLevelDbfs(absolutePath: string): Promise<number> {
  const { stderr } = await execFile("ffmpeg", [
    "-hide_banner",
    "-i",
    absolutePath,
    "-af",
    "astats=metadata=1:reset=0",
    "-f",
    "null",
    "-",
  ]);
  const matches = Array.from(stderr.matchAll(/Peak level dB:\s*(-?\d+(?:\.\d+)?|-inf)/gu));
  const peakLevel = matches.at(-1)?.[1];

  if (peakLevel === undefined) {
    throw new Error(`Could not parse peak level from ffmpeg output for ${absolutePath}.`);
  }

  return peakLevel === "-inf" ? Number.NEGATIVE_INFINITY : Number(peakLevel);
}

async function measureSegmentRmsLevelDb(
  absolutePath: string,
  startSeconds: number,
  endSeconds: number,
): Promise<number> {
  const { stderr } = await execFile("ffmpeg", [
    "-hide_banner",
    "-i",
    absolutePath,
    "-af",
    `atrim=start=${startSeconds}:end=${endSeconds},astats=metadata=1:reset=0`,
    "-f",
    "null",
    "-",
  ]);

  return parseLastMetricValue(stderr, /RMS level dB:\s*(-?\d+(?:\.\d+)?|-inf)/gu, "RMS level dB");
}

async function measureOverallRmsLevelDb(absolutePath: string): Promise<number> {
  return measureFilteredRmsLevelDb(absolutePath, "astats=metadata=1:reset=0");
}

async function measurePeakToRmsDeltaDb(absolutePath: string): Promise<number> {
  const [peakDbfs, rmsDb] = await Promise.all([
    measurePeakLevelDbfs(absolutePath),
    measureOverallRmsLevelDb(absolutePath),
  ]);

  return peakDbfs - rmsDb;
}

async function measureMidSideBalanceDb(absolutePath: string): Promise<{
  midDb: number;
  sideDb: number;
  sideMinusMidDb: number;
}> {
  const midDb = await measureFilteredRmsLevelDb(
    absolutePath,
    "pan=mono|c0=0.5*c0+0.5*c1,astats=metadata=1:reset=0",
  );
  const sideDb = await measureFilteredRmsLevelDb(
    absolutePath,
    "pan=mono|c0=0.5*c0-0.5*c1,astats=metadata=1:reset=0",
  );

  return {
    midDb,
    sideDb,
    sideMinusMidDb: sideDb - midDb,
  };
}

async function measureFilteredRmsLevelDb(
  absolutePath: string,
  filterChain: string,
): Promise<number> {
  const { stderr } = await execFile("ffmpeg", [
    "-hide_banner",
    "-i",
    absolutePath,
    "-af",
    filterChain,
    "-f",
    "null",
    "-",
  ]);

  return parseLastMetricValue(stderr, /RMS level dB:\s*(-?\d+(?:\.\d+)?|-inf)/gu, "RMS level dB");
}

async function measureDominantFrequencyHz(absolutePath: string): Promise<number> {
  const metadata = await probeAudioMetadata(absolutePath);
  const { stdout } = await execFile(
    "ffmpeg",
    ["-hide_banner", "-i", absolutePath, "-vn", "-sn", "-dn", "-ac", "1", "-f", "s16le", "-"],
    { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 },
  );
  const pcmBuffer = stdout as Buffer;
  const totalSamples = Math.floor(pcmBuffer.length / 2);
  const startIndex = Math.floor(metadata.sampleRateHz * 0.1);
  const endIndex = Math.max(startIndex + 1, totalSamples - Math.floor(metadata.sampleRateHz * 0.1));
  let crossings = 0;
  let previousSign = 0;

  for (let index = startIndex; index < endIndex; index += 1) {
    const sample = pcmBuffer.readInt16LE(index * 2);
    const sign = Math.sign(sample);

    if (sign === 0) {
      continue;
    }

    if (previousSign !== 0 && sign !== previousSign) {
      crossings += 1;
    }

    previousSign = sign;
  }

  const analyzedSeconds = (endIndex - startIndex) / metadata.sampleRateHz;
  return crossings / (2 * analyzedSeconds);
}

function parseLastMetricValue(stderr: string, pattern: RegExp, label: string): number {
  const matches = Array.from(stderr.matchAll(pattern));
  const value = matches.at(-1)?.[1];

  if (value === undefined) {
    throw new Error(`Could not parse ${label} from ffmpeg output.`);
  }

  return value === "-inf" ? Number.NEGATIVE_INFINITY : Number(value);
}

function computeChannelRms(samples: ArrayLike<number>): number {
  if (samples.length === 0) {
    return 0;
  }

  let sumSquares = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0;
    sumSquares += sample * sample;
  }

  return Math.sqrt(sumSquares / samples.length);
}

function computeAverageAbsoluteDifference(
  source: ArrayLike<number>,
  candidate: ArrayLike<number>,
): number {
  const comparedLength = Math.min(source.length, candidate.length);

  if (comparedLength === 0) {
    return 0;
  }

  let totalDifference = 0;
  for (let index = 0; index < comparedLength; index += 1) {
    totalDifference += Math.abs((source[index] ?? 0) - (candidate[index] ?? 0));
  }

  return totalDifference / comparedLength;
}

function minimumAverageDifferenceForOperation(
  operation:
    | "reverb"
    | "delay"
    | "echo"
    | "bitcrush"
    | "distortion"
    | "saturation"
    | "flanger"
    | "phaser",
): number {
  switch (operation) {
    case "flanger":
    case "phaser":
      return 20;
    case "delay":
    case "echo":
    case "reverb":
      return 80;
    default:
      return 120;
  }
}

function validateAgainstSchema(schema: unknown, payload: unknown): boolean {
  const Ajv2020 = Ajv2020Import as unknown as new (options: {
    strict: boolean;
  }) => {
    addSchema: (value: unknown, key?: string) => void;
    compile: (value: unknown) => {
      (candidate: unknown): boolean;
      errors?: unknown;
    };
  };
  const addFormats = addFormatsImport as unknown as (ajv: object) => void;
  const ajv = new Ajv2020({ strict: true });
  addFormats(ajv);
  ajv.addSchema(commonSchema, commonSchema.$id);
  const validate = ajv.compile(schema);
  const valid = validate(payload);

  if (!valid) {
    throw new Error(JSON.stringify(validate.errors));
  }

  return true;
}
