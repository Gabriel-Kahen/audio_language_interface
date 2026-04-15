export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function mean(values: ArrayLike<number>): number {
  if (values.length === 0) {
    return 0;
  }

  let total = 0;
  for (let index = 0; index < values.length; index += 1) {
    total += values[index] ?? 0;
  }
  return total / values.length;
}

export function rms(values: ArrayLike<number>): number {
  if (values.length === 0) {
    return 0;
  }

  let total = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? 0;
    total += value * value;
  }
  return Math.sqrt(total / values.length);
}

export function maxAbs(values: ArrayLike<number>): number {
  let peak = 0;
  for (let index = 0; index < values.length; index += 1) {
    const absolute = Math.abs(values[index] ?? 0);
    if (absolute > peak) {
      peak = absolute;
    }
  }
  return peak;
}

export function toDecibels(value: number, floor = 1e-12): number {
  return 20 * Math.log10(Math.max(value, floor));
}

export function percentile(sortedValues: number[], ratio: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  const position = clamp(ratio, 0, 1) * (sortedValues.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sortedValues[lowerIndex] ?? sortedValues[sortedValues.length - 1] ?? 0;
  const upper = sortedValues[upperIndex] ?? lower;
  const weight = position - lowerIndex;
  return lower + (upper - lower) * weight;
}

export function createHannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let index = 0; index < size; index += 1) {
    window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (size - 1));
  }
  return window;
}

export function correlation(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) {
    return 1;
  }

  let meanA = 0;
  let meanB = 0;
  for (let index = 0; index < length; index += 1) {
    meanA += a[index] ?? 0;
    meanB += b[index] ?? 0;
  }
  meanA /= length;
  meanB /= length;

  let numerator = 0;
  let denomA = 0;
  let denomB = 0;
  for (let index = 0; index < length; index += 1) {
    const deltaA = (a[index] ?? 0) - meanA;
    const deltaB = (b[index] ?? 0) - meanB;
    numerator += deltaA * deltaB;
    denomA += deltaA * deltaA;
    denomB += deltaB * deltaB;
  }

  const denominator = Math.sqrt(denomA * denomB);
  return denominator === 0 ? 1 : numerator / denominator;
}

export function averageChannels(channels: Float32Array[]): Float32Array {
  const frameCount = channels[0]?.length ?? 0;
  const mono = new Float32Array(frameCount);

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    let sample = 0;
    for (const channel of channels) {
      sample += channel[frameIndex] ?? 0;
    }
    mono[frameIndex] = sample / Math.max(channels.length, 1);
  }

  return mono;
}

export function sliceFrames(channel: Float32Array, start: number, length: number): Float32Array {
  const clampedStart = clamp(start, 0, channel.length);
  const clampedEnd = clamp(start + length, clampedStart, channel.length);
  return channel.slice(clampedStart, clampedEnd);
}
