export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly issues?: { path: (string | number)[]; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody {
  error: string;
  message?: string;
  issues?: { path: (string | number)[]; message: string }[];
}

export const SERVER_UNREACHABLE_MESSAGE = 'Could not reach the server. Check that the backend is running, then try again.';

function describeStatus(status: number): string {
  switch (status) {
    case 400:
      return 'The request was invalid.';
    case 401:
      return 'Not signed in.';
    case 403:
      return 'You do not have permission to do this.';
    case 404:
      return 'Not found.';
    default:
      return 'Something went wrong.';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return (await requestWithHeaders<T>(path, init)).data;
}

async function requestWithHeaders<T>(path: string, init?: RequestInit): Promise<{ data: T; headers: Headers }> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', SERVER_UNREACHABLE_MESSAGE);
  }

  if (response.status === 204) return { data: undefined as T, headers: response.headers };

  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // A 5xx without a JSON body did not come from the ERP API (e.g. the Vite
    // dev proxy or a gateway when the backend is down): report it as such.
    if (response.status >= 500) throw new ApiError(response.status, 'NETWORK_ERROR', SERVER_UNREACHABLE_MESSAGE);
    throw new ApiError(response.status, 'INVALID_RESPONSE', 'The server returned an unexpected response.');
  }
  // Same for an empty 5xx body: the ERP API always sends a JSON error body.
  if (body === undefined && response.status >= 500) {
    throw new ApiError(response.status, 'NETWORK_ERROR', SERVER_UNREACHABLE_MESSAGE);
  }

  if (!response.ok) {
    const errorBody = (body ?? {}) as Partial<ErrorBody>;
    throw new ApiError(
      response.status,
      errorBody.error ?? 'UNKNOWN_ERROR',
      errorBody.message ?? describeStatus(response.status),
      errorBody.issues,
    );
  }

  return { data: body as T, headers: response.headers };
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  /** Same as `get`, plus the response headers (e.g. `X-Result-Truncated` on capped lists). */
  getWithHeaders: <T>(path: string) => requestWithHeaders<T>(path, { method: 'GET' }),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
};
