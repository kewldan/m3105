import type { ReactNode } from "react";

import { JsonLd } from "@/components/site/json-ld";
import { ServiceWorker } from "@/components/site/service-worker";
import { SiteShell } from "@/components/site/site-shell";
import { getSettings } from "@/lib/api/public";
import {
  absoluteUrl,
  DEFAULT_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
} from "@/lib/seo";

export default async function SiteLayout({
  children,
}: {
  children: ReactNode;
}) {
  const settings = await getSettings()
    .then((r) => r.settings)
    .catch(() => null);
  const name = settings?.siteTitle || SITE_NAME;
  const sameAs = (settings?.links ?? [])
    .map((l) => l.url)
    .filter((u) => /^https?:\/\//.test(u));
  const publisher = {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name,
    url: SITE_URL,
    logo: absoluteUrl("/icon.svg"),
    ...(sameAs.length ? { sameAs } : {}),
  };
  return (
    <SiteShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          "@id": `${SITE_URL}/#website`,
          name,
          url: SITE_URL,
          description: settings?.description || DEFAULT_DESCRIPTION,
          inLanguage: "ru",
          publisher,
          // Студенческий сайт, не официальный ресурс вуза: «о чём», а не «чей».
          about: {
            "@type": "CollegeOrUniversity",
            name: "Университет ИТМО",
            url: "https://itmo.ru",
          },
          audience: {
            "@type": "EducationalAudience",
            educationalRole: "student",
          },
        }}
      />
      {children}
      <ServiceWorker />
    </SiteShell>
  );
}
