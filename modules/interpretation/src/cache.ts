import type { IntentInterpretation, InterpretationCacheStore } from "./types.js";

/**
 * Simple in-memory cache for interpretation artifacts.
 *
 * Callers must inject this explicitly; the interpretation module does not keep
 * hidden global cache state by default.
 */
export class MemoryInterpretationCache implements InterpretationCacheStore {
  private readonly store = new Map<string, IntentInterpretation>();

  get(key: string): IntentInterpretation | undefined {
    return this.store.get(key);
  }

  set(key: string, value: IntentInterpretation): void {
    this.store.set(key, value);
  }

  clear(): void {
    this.store.clear();
  }
}
