import { ApiError } from '../../lib/api-client';

// Times are shown in the restaurant's zone regardless of the device's zone
// (UI-STOCK-001: "Times shown in Asia/Karachi").
const DATE_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Karachi',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "03 Oct 2026, 10:12" (approved G2 format), built from parts so ICU locale quirks ("Sept") don't leak in. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const parts = Object.fromEntries(DATE_TIME.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}`;
}

/** Page-level message for a failed read or an unexpected write error. */
export function describeStockError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong.';
  if (error.status === 401) {
    return 'Not signed in — sign-in is not implemented yet. This is expected until the login/session system ships.';
  }
  if (error.status === 403) {
    return "Your current role doesn't have permission — only Owner or Manager can view or manage stock.";
  }
  if (error.status === 404) return 'This record no longer exists — refresh the page.';
  return error.message;
}

/** Error text for an Owner-only `active` change: a 403 there means "Owner only", not "Owner or Manager". */
export function describeActiveChangeError(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return `Only the Owner can activate or deactivate locations. ${codeSuffix(error)}`;
  }
  return describeStockError(error);
}

/** "(409 · CODE)" suffix the approved design shows after inline server errors. */
export function codeSuffix(error: ApiError): string {
  return `(${error.status} · ${error.code})`;
}
