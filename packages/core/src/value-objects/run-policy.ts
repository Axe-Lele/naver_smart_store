// File: packages/core/src/value-objects/run-policy.ts
import { z } from 'zod';

export const runPolicySchema = z.object({
  dryRun: z.boolean().default(false),
  delayMs: z.number().int().min(0).default(1_500),
  concurrency: z.number().int().min(1).max(8).default(1),
  headless: z.boolean().default(false),
  consecutiveFailureLimit: z.number().int().min(1).max(100).default(10),
  productsUrl: z.string().url(),
  captureScreenshotOnFailure: z.boolean().default(true),
  captureHtmlOnFailure: z.boolean().default(true),
  selectorProfileId: z.string().trim().min(1).default('smartstore-default'),
});

export type RunPolicyInput = z.input<typeof runPolicySchema>;
export type RunPolicyPrimitives = z.output<typeof runPolicySchema>;

export class RunPolicy {
  private constructor(private readonly primitives: RunPolicyPrimitives) {}

  static create(input: RunPolicyInput): RunPolicy {
    return new RunPolicy(runPolicySchema.parse(input));
  }

  get dryRun(): boolean {
    return this.primitives.dryRun;
  }

  get delayMs(): number {
    return this.primitives.delayMs;
  }

  get concurrency(): number {
    return this.primitives.concurrency;
  }

  get headless(): boolean {
    return this.primitives.headless;
  }

  get consecutiveFailureLimit(): number {
    return this.primitives.consecutiveFailureLimit;
  }

  get productsUrl(): string {
    return this.primitives.productsUrl;
  }

  get captureScreenshotOnFailure(): boolean {
    return this.primitives.captureScreenshotOnFailure;
  }

  get captureHtmlOnFailure(): boolean {
    return this.primitives.captureHtmlOnFailure;
  }

  get selectorProfileId(): string {
    return this.primitives.selectorProfileId;
  }

  withOverrides(overrides: Partial<RunPolicyInput>): RunPolicy {
    return RunPolicy.create({
      ...this.primitives,
      ...overrides,
    });
  }

  toPrimitives(): RunPolicyPrimitives {
    return {
      ...this.primitives,
    };
  }
}
