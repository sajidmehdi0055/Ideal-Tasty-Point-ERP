/** Per-user sliding one-minute window, in process memory (ADR-0011 D-09; single API process). */
export class AiRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly perMinute: number, private readonly now: () => number = Date.now) {}

  /** Records a hit and returns true when it is allowed. */
  allow(key: string): boolean {
    const current = this.now();
    const windowStart = current - 60_000;
    const recent = (this.hits.get(key) ?? []).filter(time => time > windowStart);
    if (recent.length >= this.perMinute) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(current);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(windowStart);
    return true;
  }

  private prune(windowStart: number) {
    for (const [key, times] of this.hits) if (!times.some(time => time > windowStart)) this.hits.delete(key);
  }
}
