import { db } from '../db';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';

function stringToLockId(lockName: string): number {
  const hash = crypto.createHash('md5').update(lockName).digest();
  return hash.readInt32BE(0);
}

export class DistributedLock {
  private lockId: number;
  private lockName: string;
  private acquired: boolean = false;

  constructor(lockName: string) {
    this.lockName = lockName;
    this.lockId = stringToLockId(lockName);
  }

  async tryAcquire(): Promise<boolean> {
    try {
      const result = await db.execute(sql`
        SELECT pg_try_advisory_lock(${this.lockId}) as acquired
      `);

      this.acquired = result.rows[0]?.acquired === true;

      if (this.acquired) {
        console.log(`[DistributedLock] Acquired lock: ${this.lockName} (id: ${this.lockId})`);
      } else {
        console.log(`[DistributedLock] Lock already held: ${this.lockName}`);
      }

      return this.acquired;
    } catch (error) {
      console.error(`[DistributedLock] Failed to acquire lock ${this.lockName}:`, error);
      return false;
    }
  }

  async acquire(timeoutMs: number = 60000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (await this.tryAcquire()) {
        return true;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.error(`[DistributedLock] Lock acquisition timeout: ${this.lockName}`);
    return false;
  }

  async release(): Promise<void> {
    if (!this.acquired) {
      console.warn(`[DistributedLock] Attempted to release unheld lock: ${this.lockName}`);
      return;
    }

    try {
      await db.execute(sql`
        SELECT pg_advisory_unlock(${this.lockId})
      `);

      this.acquired = false;
      console.log(`[DistributedLock] Released lock: ${this.lockName}`);
    } catch (error) {
      console.error(`[DistributedLock] Failed to release lock ${this.lockName}:`, error);
    }
  }

  async withLock<T>(
    fn: () => Promise<T>,
    timeoutMs: number = 60000
  ): Promise<T | null> {
    const acquired = await this.tryAcquire();

    if (!acquired) {
      console.log(`[DistributedLock] Skipping execution - lock held by another process`);
      return null;
    }

    try {
      return await fn();
    } finally {
      await this.release();
    }
  }
}

export async function withDistributedLock<T>(
  lockName: string,
  fn: () => Promise<T>
): Promise<T | null> {
  const lock = new DistributedLock(lockName);
  return lock.withLock(fn);
}
