import { LockIcon, LogInIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/site/empty-state";
import { Button } from "@/components/ui/button";

/** Shown instead of a feed to anyone outside the site's group. */
export function GroupGate({
  reason,
  group,
  next,
}: {
  reason: "login" | "member";
  group: string;
  next: string;
}) {
  return (
    <EmptyState
      icon={LockIcon}
      title={`Только для группы ${group}`}
      description={
        reason === "login"
          ? `Раздел видят студенты ${group}, вошедшие на сайт.`
          : `Раздел видят только подтверждённые студенты ${group}. Если вы из группы, дождитесь, пока администратор подтвердит аккаунт.`
      }
      action={
        reason === "login" ? (
          <Button
            size="sm"
            render={<Link href={`/login?next=${encodeURIComponent(next)}`} />}
          >
            <LogInIcon data-icon="inline-start" />
            Войти
          </Button>
        ) : null
      }
    />
  );
}
