import { Tm } from "@/components/app/tx";

export function FormMessage({ error, ok }: { error?: string; ok?: string }) {
  if (error) {
    return (
      <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <Tm>{error}</Tm>
      </p>
    );
  }
  if (ok) {
    return (
      <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        <Tm>{ok}</Tm>
      </p>
    );
  }
  return null;
}
