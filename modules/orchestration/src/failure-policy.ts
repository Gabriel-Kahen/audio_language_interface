import type { FailurePolicy, WorkflowStage, WorkflowTraceEntry } from "./types.js";

export class OrchestrationStageError<TPartial = unknown> extends Error {
  readonly stage: WorkflowStage;
  readonly attempts: number;
  readonly partialResult: TPartial | undefined;

  constructor(options: {
    stage: WorkflowStage;
    error: Error;
    attempts: number;
    partialResult?: TPartial;
  }) {
    super(`Orchestration stage '${options.stage}' failed: ${options.error.message}`, {
      cause: options.error,
    });
    this.name = "OrchestrationStageError";
    this.stage = options.stage;
    this.attempts = options.attempts;
    this.partialResult = options.partialResult;
  }
}

export async function executeWithFailurePolicy<T, TPartial>(options: {
  stage: WorkflowStage;
  operation: () => Promise<T>;
  failurePolicy?: FailurePolicy | undefined;
  getPartialResult?: (() => TPartial) | undefined;
  pass?: number | undefined;
  trace: WorkflowTraceEntry[];
}): Promise<T> {
  const maxAttempts = options.failurePolicy?.maxAttemptsByStage?.[options.stage] ?? 1;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt += 1;
    const startedAt = new Date().toISOString();

    try {
      const result = await options.operation();
      options.trace.push({
        stage: options.stage,
        status: "ok",
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        attempts: attempt,
        ...(options.pass === undefined ? {} : { pass: options.pass }),
      });
      return result;
    } catch (error) {
      const normalizedError = toError(error);
      const shouldRetry =
        attempt < maxAttempts &&
        (await options.failurePolicy?.shouldRetry?.({
          stage: options.stage,
          attempt,
          error: normalizedError,
        }));

      if (shouldRetry) {
        continue;
      }

      options.trace.push({
        stage: options.stage,
        status: "error",
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        attempts: attempt,
        ...(options.pass === undefined ? {} : { pass: options.pass }),
        message: normalizedError.message,
      });

      throw new OrchestrationStageError({
        stage: options.stage,
        error: normalizedError,
        attempts: attempt,
        partialResult: options.getPartialResult?.(),
      });
    }
  }

  throw new Error(`Unreachable failure policy state for stage '${options.stage}'`);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
