import { NotFoundContent } from "@/components/site/not-found-content";
import { SiteShell } from "@/components/site/site-shell";

/** Root 404: unmatched URLs render with the public site chrome. */
export default function RootNotFound() {
  return (
    <SiteShell>
      <NotFoundContent />
    </SiteShell>
  );
}
