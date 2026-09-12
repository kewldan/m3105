"use client";

import { CopyIcon, PencilIcon, TrashIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Compact edit / duplicate / delete buttons for table rows. */
export function RowActions({
  editHref,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  editHref?: string;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      {editHref || onEdit ? (
        <Tooltip>
          <TooltipTrigger
            render={
              editHref ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Редактировать"
                  render={<Link href={editHref} />}
                />
              ) : (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Редактировать"
                  onClick={onEdit}
                />
              )
            }
          >
            <PencilIcon />
          </TooltipTrigger>
          <TooltipContent>Редактировать</TooltipContent>
        </Tooltip>
      ) : null}
      {onDuplicate ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Дублировать"
                onClick={onDuplicate}
              />
            }
          >
            <CopyIcon />
          </TooltipTrigger>
          <TooltipContent>Дублировать</TooltipContent>
        </Tooltip>
      ) : null}
      {onDelete ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Удалить"
                onClick={onDelete}
                className="text-muted-foreground hover:text-destructive"
              />
            }
          >
            <TrashIcon />
          </TooltipTrigger>
          <TooltipContent>Удалить</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}
