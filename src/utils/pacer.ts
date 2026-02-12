export class RequestPacer {
  private readonly minIntervalMs: number;
  private lastRequestTime = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(minIntervalMs = 500) {
    this.minIntervalMs = minIntervalMs;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const task = this.queue.then(async () => {
      const now = Date.now();
      const elapsed = now - this.lastRequestTime;
      if (elapsed < this.minIntervalMs) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.minIntervalMs - elapsed),
        );
      }
      this.lastRequestTime = Date.now();
      return fn();
    });

    this.queue = task.then(
      () => undefined,
      () => undefined,
    );

    return task;
  }
}
