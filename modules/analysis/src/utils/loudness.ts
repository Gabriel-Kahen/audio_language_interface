import { execa } from "execa";

export interface LoudnessMetrics {
  integratedLufs: number;
  truePeakDbtp: number;
}

interface FfmpegLoudnormOutput {
  input_i?: string;
  input_tp?: string;
}

export async function measureLoudnessWithFfmpeg(sourcePath: string): Promise<LoudnessMetrics> {
  try {
    const { stderr } = await execa(
      "ffmpeg",
      [
        "-hide_banner",
        "-nostats",
        "-i",
        sourcePath,
        "-af",
        "loudnorm=I=-24:TP=-2:LRA=7:print_format=json",
        "-f",
        "null",
        "-",
      ],
      {
        reject: false,
      },
    );

    const metrics = parseLoudnormMetrics(stderr);
    if (metrics !== undefined) {
      return metrics;
    }
  } catch (error) {
    throw new Error(
      `FFmpeg loudness analysis failed for ${sourcePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  throw new Error(`FFmpeg loudness analysis did not produce loudnorm metrics for ${sourcePath}`);
}

function parseLoudnormMetrics(stderr: string): LoudnessMetrics | undefined {
  const jsonMatch = stderr.match(/\{[\s\S]*?"input_i"\s*:\s*"[^"]+"[\s\S]*?\}/);
  if (jsonMatch === null) {
    return undefined;
  }

  const parsed = JSON.parse(jsonMatch[0]) as FfmpegLoudnormOutput;
  const integratedLufs = Number(parsed.input_i);
  const truePeakDbtp = Number(parsed.input_tp);

  if (!Number.isFinite(integratedLufs) || !Number.isFinite(truePeakDbtp)) {
    return undefined;
  }

  return {
    integratedLufs,
    truePeakDbtp,
  };
}
