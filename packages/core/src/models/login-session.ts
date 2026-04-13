// File: packages/core/src/models/login-session.ts
import { z } from 'zod';

export const loginSessionStatusSchema = z.enum([
  'UNKNOWN',
  'READY',
  'MISSING',
  'EXPIRED',
  'LOGIN_REQUIRED',
  'CHALLENGE_REQUIRED',
  'ACCESS_DENIED',
  'INVALID',
]);
export type LoginSessionStatus = z.infer<typeof loginSessionStatusSchema>;

export const loginSessionSnapshotSchema = z.object({
  storageStatePath: z.string().trim().min(1),
  status: loginSessionStatusSchema.default('UNKNOWN'),
  preparedAt: z.string().datetime().optional(),
  validatedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  lastErrorMessage: z.string().trim().min(1).optional(),
});

export type LoginSessionSnapshot = z.output<typeof loginSessionSnapshotSchema>;
export type LoginSessionInput = z.input<typeof loginSessionSnapshotSchema>;

export class LoginSession {
  private constructor(private readonly snapshot: LoginSessionSnapshot) {}

  static create(input: LoginSessionInput): LoginSession {
    return new LoginSession(loginSessionSnapshotSchema.parse(input));
  }

  get storageStatePath(): string {
    return this.snapshot.storageStatePath;
  }

  get status(): LoginSessionStatus {
    return this.snapshot.status;
  }

  get preparedAt(): string | undefined {
    return this.snapshot.preparedAt;
  }

  get validatedAt(): string | undefined {
    return this.snapshot.validatedAt;
  }

  get expiresAt(): string | undefined {
    return this.snapshot.expiresAt;
  }

  get lastErrorMessage(): string | undefined {
    return this.snapshot.lastErrorMessage;
  }

  isUsable(nowIso = new Date().toISOString()): boolean {
    if (this.status !== 'READY') {
      return false;
    }

    if (!this.snapshot.expiresAt) {
      return true;
    }

    return this.snapshot.expiresAt > nowIso;
  }

  needsRecovery(): boolean {
    return this.status !== 'READY';
  }

  markValidated(validatedAt = new Date().toISOString()): LoginSession {
    return new LoginSession({
      ...this.snapshot,
      status: 'READY',
      validatedAt,
      lastErrorMessage: undefined,
    });
  }

  markInvalid(
    status: Exclude<LoginSessionStatus, 'READY' | 'UNKNOWN'>,
    lastErrorMessage?: string,
  ): LoginSession {
    return new LoginSession({
      ...this.snapshot,
      status,
      lastErrorMessage,
    });
  }

  toSnapshot(): LoginSessionSnapshot {
    return {
      ...this.snapshot,
    };
  }
}
