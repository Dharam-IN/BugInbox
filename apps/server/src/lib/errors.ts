export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(400, code, message, details);
export const unauthorised = (message = 'You need to sign in to do that.') =>
  new AppError(401, 'unauthenticated', message);
export const forbidden = (message = 'You do not have access to that.') => new AppError(403, 'forbidden', message);
/** Ownership failures are reported as 404 so ids cannot be probed across accounts. */
export const notFound = (message = 'Not found.') => new AppError(404, 'not_found', message);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const tooLarge = (message = 'The request is too large.') => new AppError(413, 'payload_too_large', message);
export const tooManyRequests = (message: string, retryAfterSeconds: number) =>
  new AppError(429, 'rate_limited', message, { retryAfterSeconds });
