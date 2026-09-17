import { handlers } from "@/auth";

/* Sign-in compares bcrypt hashes and reads the user row: Node, not the edge. */
export const runtime = "nodejs";

export const { GET, POST } = handlers;
