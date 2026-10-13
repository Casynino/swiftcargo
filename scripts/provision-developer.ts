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
import { prisma } from "@/lib/prisma";
import { provisionDeveloper } from "@/lib/developer";

async function main() {
  const email = process.env.DEVELOPER_EMAIL ?? "";
  const name = process.env.DEVELOPER_NAME ?? "Developer";
  const password = process.env.DEVELOPER_PASSWORD;
  const reset = process.argv.includes("--reset-password");
  const yes = process.argv.includes("--yes");

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
