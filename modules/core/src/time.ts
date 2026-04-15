export type IsoTimestamp = string;

const ISO_UTC_TIMESTAMP_PATTERN =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.\d+)?Z$/;

/** Returns the current time as an ISO 8601 UTC timestamp. */
export function nowTimestamp(): IsoTimestamp {
  return new Date().toISOString();
}

/** Normalizes a date-like input to the repository's ISO 8601 UTC timestamp form. */
export function toIsoTimestamp(value: Date | number | string): IsoTimestamp {
  return new Date(value).toISOString();
}

/** Accepts only parseable ISO 8601 UTC timestamps that end in `Z`. */
export function isIsoTimestamp(value: unknown): value is IsoTimestamp {
  if (typeof value !== "string") {
    return false;
  }

  const match = ISO_UTC_TIMESTAMP_PATTERN.exec(value);

  if (!match?.groups) {
    return false;
  }

  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const hour = Number(match.groups.hour);
  const minute = Number(match.groups.minute);
  const second = Number(match.groups.second);

  if (hour > 23 || minute > 59 || second > 59) {
    return false;
  }

  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  );
}
