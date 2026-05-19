/**
 * Development-only logging utilities.
 * All methods are no-ops in production builds to avoid console noise
 * and prevent internal error details from leaking to end users.
 */
export const devLog = {
  error: (...args: unknown[]) => {
    if (import.meta.env.DEV) console.error(...args);
  },
  warn: (...args: unknown[]) => {
    if (import.meta.env.DEV) console.warn(...args);
  },
  log: (...args: unknown[]) => {
    if (import.meta.env.DEV) console.log(...args);
  },
};
