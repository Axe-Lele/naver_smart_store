import type { ProductTask } from '../domain/types.js';

export class WorkQueue {
  private index = 0;
  private stopped = false;

  constructor(private readonly items: ProductTask[]) {}

  next(): ProductTask | undefined {
    if (this.stopped) {
      return undefined;
    }

    const item = this.items[this.index];
    this.index += 1;
    return item;
  }

  stop(): void {
    this.stopped = true;
  }
}
