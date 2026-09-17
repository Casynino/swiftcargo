import { z } from "zod";

/**
 * The environment a production server cannot run without, checked once as the
 * server starts (instrumentation.ts), not at build.
 *
 * A missing secret otherwise shows up an hour later as one confusing failure on
 * one screen: sign-in that throws, a label that cannot print, a payment slip
 * that uploads to a disk that is gone by the next request. Stopping the server
 * with the list of what is wrong puts it in the deploy log instead.
 *
 * Not at build time: `next build` runs without secrets in some pipelines and
 * reads none of these to compile. Development is not held to it either.
 */

const NOT_PUBLIC = /localhost|127\.0\.0\.1|0\.0\.0\.0/;

const postgres = z
  .string({ required_error: "is not set" })
  .trim()
  .min(1, "is not set")
  .regex(/^postgres(ql)?:\/\//, "must be a postgresql:// connection string");

const schema = z
  .object({
    DATABASE_URL: postgres,
    DIRECT_URL: postgres.optional(),
    NEXT_PUBLIC_SITE_URL: z
      .string({ required_error: "is not set (the public https address, printed on labels)" })
      .trim()
      .url("must be a full URL such as https://swiftcargo.co.tz")
      .refine((v) => v.startsWith("https://"), "must be https")
      .refine((v) => !NOT_PUBLIC.test(v), "must not point at localhost"),
  })
  .passthrough();

/* Checks that span more than one variable. Kept outside the schema, because zod
   skips refinements once any field has failed, and the point is to list every
   problem in one deploy log rather than one per redeploy. */
function crossChecks(env: Record<string, string | undefined>): string[] {
  const problems: string[] = [];
  const secret = env.AUTH_SECRET?.trim() || env.NEXTAUTH_SECRET?.trim();
  if (!secret) {
    problems.push("AUTH_SECRET is not set (generate one with `openssl rand -base64 32`)");
  } else if (secret.length < 32) {
    problems.push("AUTH_SECRET is shorter than 32 characters");
  }
  /* A serverless function's disk does not survive the request. Without the
     blob store every upload would appear to succeed and then be gone. */
  if (env.VERCEL && !env.BLOB_READ_WRITE_TOKEN?.trim()) {
    problems.push(
      "BLOB_READ_WRITE_TOKEN is not set; on Vercel uploaded files need a Blob store (see docs/DEPLOY.md)"
    );
  }
  return problems;
}

export class EnvironmentError extends Error {
  constructor(public readonly problems: string[]) {
    super(
      "The server environment is incomplete:\n" +
        problems.map((p) => `  - ${p}`).join("\n") +
        "\nSee .env.example and docs/DEPLOY.md."
    );
    this.name = "EnvironmentError";
  }
}

/** Problems with `env`, one readable line each; empty when it is usable. */
export function environmentProblems(env: Record<string, string | undefined>): string[] {
  const result = schema.safeParse(env);
  const fields = result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`);
  return [...fields, ...crossChecks(env)];
}

/** Variables that are dangerous to leave set on a running server. */
export function environmentWarnings(env: Record<string, string | undefined>): string[] {
  const warnings: string[] = [];
  if (env.SEED_ADMIN_PASSWORD) {
    warnings.push("SEED_ADMIN_PASSWORD is set. It belongs to development seeding only; remove it.");
  }
  if (env.ADMIN_PASSWORD) {
    warnings.push(
      "ADMIN_PASSWORD is still set. It is read once by `npm run db:seed:production`; remove it."
    );
  }
  return warnings;
}

/** Throws EnvironmentError in production when anything required is missing. */
export function assertProductionEnvironment(
  env: Record<string, string | undefined> = process.env
): void {
  if (env.NODE_ENV !== "production") return;
  for (const warning of environmentWarnings(env)) console.warn(`[env] ${warning}`);
  const problems = environmentProblems(env);
  if (problems.length > 0) throw new EnvironmentError(problems);
}
