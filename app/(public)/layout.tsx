import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Every page in this group opens on one of the dark panels. */}
      <SiteHeader overDark />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
