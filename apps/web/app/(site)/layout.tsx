import type { ReactNode } from "react";

import { JsonLd } from "@/components/site/json-ld";
import { SiteShell } from "@/components/site/site-shell";
import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <SiteShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: SITE_NAME,
          url: SITE_URL,
          description: DEFAULT_DESCRIPTION,
          inLanguage: "ru",
        }}
      />
      {children}
    </SiteShell>
  );
}
