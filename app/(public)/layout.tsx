import { SeaSky } from "@/components/sea-sky";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

/* The public site is the night version in every theme (`dark` for the shared components' own dark styles, `sc-site`
   for the deeper sea-at-night tokens and the grain over it — globals.css). */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dark sc-site relative isolate flex min-h-dvh flex-col overflow-x-clip">
      <SeaSky />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
