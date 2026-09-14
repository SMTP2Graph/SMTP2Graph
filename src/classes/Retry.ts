const RETRY_BASE_DELAY_MS = 200;
const RETRY_MAX_DELAY_MS = 60_000;
const RETRY_AFTER_MAX_DELAY_MS = 120_000;

/**
 * Return a bounded delay for a Graph retry response. A valid Retry-After value
 * takes precedence over the local exponential backoff and is never shortened
 * by jitter, because that could retry before the server permits it.
 */
export function getRetryDelay(retryAfter: unknown, attempt: number, now = Date.now(), random = Math.random): number
{
    if(typeof retryAfter === 'string')
    {
        const seconds = /^\d+$/.test(retryAfter)?Number.parseInt(retryAfter, 10):NaN;
        const httpDate = Number.isNaN(seconds)?Date.parse(retryAfter):NaN;
        const delay = Number.isNaN(seconds)?httpDate-now:seconds*1000;

        if(Number.isFinite(delay) && delay >= 0 && delay <= RETRY_AFTER_MAX_DELAY_MS)
            return delay;
    }

    const backoff = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
    return Math.round(backoff * (0.5 + random()));
}
