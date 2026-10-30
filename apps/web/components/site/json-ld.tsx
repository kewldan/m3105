import { markdownPath } from "@/lib/llms/paths";
import { absoluteUrl } from "@/lib/seo";

/** Emits a JSON-LD block. `<` is escaped so the payload can never close the script tag. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: serialized JSON-LD with `<` escaped
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}

export function breadcrumbs(
  items: { name: string; url: string }[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

/**
 * Fields that mark a note or lab page as a free learning resource and point
 * agents at its Markdown copy. Spread into an `Article` node.
 */
export function learningResource(opts: {
  path: string;
  kind: string;
  image: string;
}): Record<string, unknown> {
  const url = absoluteUrl(opts.path);
  return {
    "@type": ["Article", "LearningResource"],
    mainEntityOfPage: url,
    learningResourceType: opts.kind,
    isAccessibleForFree: true,
    image: absoluteUrl(opts.image),
    encoding: {
      "@type": "MediaObject",
      encodingFormat: "text/markdown",
      contentUrl: absoluteUrl(markdownPath(opts.path)),
    },
  };
}
