import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { AudioFixtureManifest, AudioFixtureManifestEntry } from "./types.js";

export const DEFAULT_AUDIO_FIXTURE_MANIFEST_PATH = "fixtures/audio/manifest.json";
export const BENCHMARK_REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

export async function loadAudioFixtureManifest(
  manifestPath: string = DEFAULT_AUDIO_FIXTURE_MANIFEST_PATH,
  repoRoot: string = BENCHMARK_REPO_ROOT,
): Promise<AudioFixtureManifest> {
  const absoluteManifestPath = path.resolve(repoRoot, manifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8")) as AudioFixtureManifest;

  if (!manifest || typeof manifest !== "object") {
    throw new Error(`Invalid audio fixture manifest at ${absoluteManifestPath}.`);
  }

  if (!Array.isArray(manifest.fixtures)) {
    throw new Error(`Audio fixture manifest at ${absoluteManifestPath} is missing fixtures[].`);
  }

  return manifest;
}

export function resolveAudioFixture(
  manifest: AudioFixtureManifest,
  fixtureId: string,
): AudioFixtureManifestEntry {
  const fixture = manifest.fixtures.find((entry) => entry.fixture_id === fixtureId);
  if (!fixture) {
    throw new Error(`Unknown audio fixture id '${fixtureId}'.`);
  }

  return fixture;
}

export function resolveAudioFixtureSourcePath(
  fixture: AudioFixtureManifestEntry,
  repoRoot: string = BENCHMARK_REPO_ROOT,
): string {
  return path.resolve(repoRoot, "fixtures", "audio", fixture.relative_path);
}

export async function materializeAudioFixture(
  fixture: AudioFixtureManifestEntry,
  workspaceRoot: string,
  repoRoot: string = BENCHMARK_REPO_ROOT,
): Promise<{ sourceFixturePath: string; inputPath: string }> {
  const sourceFixturePath = resolveAudioFixtureSourcePath(fixture, repoRoot);
  const inputPath = path.resolve(workspaceRoot, "fixtures", "audio", fixture.relative_path);

  await mkdir(path.dirname(inputPath), { recursive: true });
  await copyFile(sourceFixturePath, inputPath);

  return {
    sourceFixturePath,
    inputPath,
  };
}
