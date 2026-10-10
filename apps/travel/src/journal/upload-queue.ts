export interface UploadQueueTask {
  operationId: string;
  checksum: string;
  file: Blob;
  tripId: string;
  mediaId: string;
  contentType: string;
  byteSize: number;
}

export interface UploadQueueResult {
  ok: boolean;
  error?: string;
}

export interface UploadQueueOptions {
  concurrency?: number;
  upload: (task: UploadQueueTask) => Promise<void>;
}

export class UploadQueue {
  private readonly concurrency: number;
  private readonly upload: (task: UploadQueueTask) => Promise<void>;
  private readonly completed = new Set<string>();
  private readonly inFlight = new Map<string, Promise<UploadQueueResult>>();

  constructor(options: UploadQueueOptions) {
    this.concurrency = options.concurrency ?? 2;
    this.upload = options.upload;
  }

  markComplete(operationId: string): void {
    this.completed.add(operationId);
  }

  isComplete(operationId: string): boolean {
    return this.completed.has(operationId);
  }

  async enqueue(tasks: UploadQueueTask[]): Promise<Map<string, UploadQueueResult>> {
    const results = new Map<string, UploadQueueResult>();
    const pending: UploadQueueTask[] = [];
    for (const task of tasks) {
      if (this.completed.has(task.operationId)) {
        results.set(task.operationId, { ok: true });
        continue;
      }
      const existing = this.inFlight.get(task.operationId);
      if (existing) {
        pending.push(task);
        continue;
      }
      pending.push(task);
    }

    const queue = [...pending];
    const workers: Promise<void>[] = [];

    const runOne = async (task: UploadQueueTask): Promise<void> => {
      if (this.completed.has(task.operationId)) {
        results.set(task.operationId, { ok: true });
        return;
      }
      let flight = this.inFlight.get(task.operationId);
      if (!flight) {
        flight = (async () => {
          try {
            await this.upload(task);
            this.completed.add(task.operationId);
            return { ok: true };
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Upload failed';
            return { ok: false, error: message };
          } finally {
            this.inFlight.delete(task.operationId);
          }
        })();
        this.inFlight.set(task.operationId, flight);
      }
      const outcome = await flight;
      results.set(task.operationId, outcome);
    };

    let index = 0;
    const pump = async (): Promise<void> => {
      while (index < queue.length) {
        const task = queue[index++]!;
        await runOne(task);
      }
    };

    for (let i = 0; i < this.concurrency; i++) {
      workers.push(pump());
    }
    await Promise.all(workers);
    return results;
  }
}
