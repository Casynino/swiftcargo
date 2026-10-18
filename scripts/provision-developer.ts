/**
 * PROVISION THE DEVELOPER ACCOUNT.
 *
 *   DEVELOPER_EMAIL=you@example.com \
 *   DEVELOPER_NAME="Your Name" \
 *   DEVELOPER_PASSWORD='at-least-14-characters' \
 *   npm run developer:provision [-- --reset-password] [-- --yes]
 *
 * Run by hand, never by a deploy or a seed, so it cannot create a second
 * account or touch a password by itself. Safe to run again: an existing
 * developer is left exactly as it is, and its password changes only with
 * --reset-password. The password is read from the environment, hashed, and
 * never printed or written anywhere else.
 *
 * Against any database that is not on this machine it stops and asks for
 * --yes, naming the host it is about to change.
 */
import { createInterface } from "node:readline";

/** Ask one question. `secret` hides what is typed, so it never sits on screen. */
function ask(question: string, secret = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (secret) {
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (text) => {
        if (text.includes(question)) process.stdout.write(text);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (secret) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

async function main() {
  /* Anything not already in the environment is asked for, so nothing has to be
     typed into a long command — and the password and the database address are
     never echoed or left in the shell history. */
  const email = process.env.DEVELOPER_EMAIL || (await ask("Developer email: "));
  const name = process.env.DEVELOPER_NAME || (await ask("Developer name: ")) || "Developer";
  const reset = process.argv.includes("--reset-password");
  const yes = process.argv.includes("--yes");
  if (!process.env.DATABASE_URL) process.env.DATABASE_URL = await ask("Database address (postgresql://…): ", true);
  const password = process.env.DEVELOPER_PASSWORD || (await ask("Password (14+ characters): ", true)) || undefined;

  /* The database client reads its address when it loads, so it loads now. */
  const { prisma } = await import("@/lib/prisma");
  const { provisionDeveloper } = await import("@/lib/developer");

  const url = process.env.DATABASE_URL ?? "";
  const host = /@([^/:?]+)/.exec(url)?.[1] ?? /\/\/([^/:?]+)/.exec(url)?.[1] ?? "unknown";
  const local = ["localhost", "127.0.0.1", "::1"].includes(host);
  if (!local && !yes) {
    console.error(`This would change the database at ${host}. Run again with --yes if that is what you mean.`);
    process.exit(1);
  }
  if (!email) {
    console.error("Set DEVELOPER_EMAIL.");
    process.exit(1);
  }

  const result = await provisionDeveloper(prisma, { email, name, password, resetPassword: reset });
  if (result.status === "refused") {
    console.error(`Refused: ${result.reason}`);
    process.exit(1);
  }

  await prisma.auditLog.create({
    data: {
      actorEmail: "system:provision-developer",
      actorType: "STAFF",
      action: result.status === "created" ? "developer.provisioned" : "developer.provision.checked",
      entity: "User",
      entityId: result.id,
      summary:
        result.status === "created"
          ? `Developer account created for ${email.toLowerCase()}`
          : `Developer account confirmed for ${email.toLowerCase()}${result.passwordChanged ? " (password reset)" : ""}`,
    },
  });
  console.log(
    result.status === "created"
      ? `Developer account created for ${email.toLowerCase()} on ${host}.`
      : `Developer account already exists on ${host}${result.passwordChanged ? "; password reset." : "; nothing changed."}`
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
