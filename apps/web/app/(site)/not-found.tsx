import { NotFoundContent } from "@/components/site/not-found-content";

/** 404 for `notFound()` calls inside the site group (unknown lab, note, page…). */
export default function NotFound() {
  return <NotFoundContent />;
}
