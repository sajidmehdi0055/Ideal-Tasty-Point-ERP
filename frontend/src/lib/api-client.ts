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
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Is the backend running?');
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    throw new ApiError(response.status, 'INVALID_RESPONSE', 'The server returned an unexpected response.');
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

  return body as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
};
