import { notFound } from "next/navigation";

/**
 * An address under /app that no page answers. Without this the root 404 draws
 * outside the shell, and a clerk who mistyped a link loses the menu with it.
 * The shell's layout has already required a staff session by the time this runs.
 */
export default function MissingStaffPage() {
  notFound();
}
