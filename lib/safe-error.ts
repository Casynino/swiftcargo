import { Prisma } from "@prisma/client";

/**
 * The sentence a form may show for an error caught in a server action.
 *
 * Actions throw plain `Error`s with sentences written for the person at the
 * form ("That cargo no longer exists.") and those are meant to be read. What
 * must never reach a browser is the database's own wording — a constraint name,
 * a column, a table, an id — which is what a Prisma error carries in its
 * message. Those are logged for whoever reads the server log and replaced with
 * the caller's fallback.
 */
export function formMessage(error: unknown, fallback: string): string {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientValidationError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  ) {
    console.error(error);
    return fallback;
  }
  if (error instanceof Error) {
    /* A runtime fault (reading a property of undefined) or anything else that
       names the database is not a sentence for the person at the form. */
    const runtime =
      error instanceof TypeError ||
      error instanceof RangeError ||
      error instanceof ReferenceError ||
      error instanceof SyntaxError;
    if (runtime || /prisma|invocation|\bP\d{4}\b/i.test(error.message)) {
      console.error(error);
      return fallback;
    }
    return error.message;
  }
  return fallback;
}
