"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormField, FormGrid } from "@/components/admin/form-field";
import { RatingStars } from "@/components/site/social/rating-stars";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client";
import type { Post, PostInput, PostKind } from "@/lib/api/types";

const schema = z.object({
  title: z.string().trim().max(120, "Не больше 120 символов"),
  body: z
    .string()
    .trim()
    .min(1, "Напишите текст")
    .max(4000, "Не больше 4000 символов"),
  address: z.string().trim().max(200, "Не больше 200 символов"),
  price: z.string().regex(/^\d*$/, "Только число"),
  rating: z.number().int().min(1).max(5).nullable(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  title: "",
  body: "",
  address: "",
  price: "",
  rating: null,
};

const COPY: Record<
  PostKind,
  {
    create: string;
    edit: string;
    hint: string;
    bodyLabel: string;
    bodyPlaceholder: string;
  }
> = {
  shawarma: {
    create: "Новая точка",
    edit: "Редактировать обзор",
    hint: "Где брали, сколько стоила и стоит ли идти снова.",
    bodyLabel: "Впечатления",
    bodyPlaceholder: "Сочная, много мяса, соус острый. Очередь в обед…",
  },
  joke: {
    create: "Новый анекдот",
    edit: "Редактировать анекдот",
    hint: "Свой или услышанный на паре — главное, чтобы было смешно.",
    bodyLabel: "Текст",
    bodyPlaceholder: "Заходит студент на пересдачу…",
  },
};

/**
 * Create / edit form for a post. `onSave` performs the request so the same
 * dialog serves students (own posts) and admins (any post).
 */
export function PostDialog({
  kind,
  post,
  open,
  onOpenChange,
  onSave,
  onSaved,
}: {
  kind: PostKind;
  post: Post | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: PostInput) => Promise<Post>;
  onSaved: (post: Post) => void;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });
  const { reset, setError } = form;
  const copy = COPY[kind];

  useEffect(() => {
    if (!open) return;
    reset(
      post
        ? {
            title: post.title,
            body: post.body,
            address: post.address,
            price: post.price == null ? "" : String(post.price),
            rating: post.rating,
          }
        : EMPTY,
    );
  }, [open, post, reset]);

  async function onSubmit(values: FormValues) {
    if (kind === "shawarma") {
      if (!values.title) {
        setError("title", {
          type: "manual",
          message: "Укажите название точки",
        });
        return;
      }
      if (values.rating == null) {
        setError("rating", { type: "manual", message: "Поставьте оценку" });
        return;
      }
    }
    const input: PostInput = {
      kind,
      title: values.title,
      body: values.body,
      address: kind === "shawarma" ? values.address : "",
      price:
        kind === "shawarma" && values.price !== ""
          ? Number(values.price)
          : null,
      rating: kind === "shawarma" ? values.rating : null,
    };
    try {
      const saved = await onSave(input);
      toast.success(post ? "Сохранено" : "Опубликовано");
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        let mapped = 0;
        for (const [key, message] of Object.entries(err.fields)) {
          if (key in EMPTY) {
            setError(key as keyof FormValues, { type: "server", message });
            mapped += 1;
          }
        }
        toast.error(
          err.fields._ ??
            (mapped > 0 ? "Проверьте выделенные поля" : err.message),
        );
        return;
      }
      toast.error("Не удалось сохранить");
    }
  }

  const errors = form.formState.errors;
  const saving = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="contents"
          noValidate
        >
          <DialogHeader>
            <DialogTitle>{post ? copy.edit : copy.create}</DialogTitle>
            <DialogDescription>{copy.hint}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {kind === "shawarma" ? (
              <>
                <FormField
                  label="Название точки"
                  htmlFor="post-title"
                  required
                  error={errors.title?.message}
                >
                  <Input
                    id="post-title"
                    placeholder="Шаверма у метро Горьковская"
                    autoFocus
                    {...form.register("title")}
                    aria-invalid={!!errors.title || undefined}
                  />
                </FormField>
                <FormGrid>
                  <FormField
                    label="Адрес"
                    htmlFor="post-address"
                    error={errors.address?.message}
                  >
                    <Input
                      id="post-address"
                      placeholder="Кронверкский пр., 49"
                      {...form.register("address")}
                    />
                  </FormField>
                  <FormField
                    label="Цена, ₽"
                    htmlFor="post-price"
                    error={errors.price?.message}
                  >
                    <Input
                      id="post-price"
                      inputMode="numeric"
                      placeholder="250"
                      {...form.register("price")}
                      aria-invalid={!!errors.price || undefined}
                    />
                  </FormField>
                </FormGrid>
                <Controller
                  control={form.control}
                  name="rating"
                  render={({ field }) => (
                    <FormField
                      label="Оценка"
                      required
                      error={errors.rating?.message}
                    >
                      <RatingStars
                        value={field.value}
                        onChange={field.onChange}
                        size="lg"
                      />
                    </FormField>
                  )}
                />
              </>
            ) : (
              <FormField
                label="Заголовок"
                htmlFor="post-title"
                description="Необязательно."
                error={errors.title?.message}
              >
                <Input
                  id="post-title"
                  placeholder="Про матан"
                  {...form.register("title")}
                  aria-invalid={!!errors.title || undefined}
                />
              </FormField>
            )}
            <FormField
              label={copy.bodyLabel}
              htmlFor="post-body"
              required
              error={errors.body?.message}
            >
              <Textarea
                id="post-body"
                rows={kind === "joke" ? 6 : 4}
                placeholder={copy.bodyPlaceholder}
                autoFocus={kind === "joke"}
                {...form.register("body")}
                aria-invalid={!!errors.body || undefined}
              />
            </FormField>
          </div>
          <DialogFooter>
            <DialogClose
              render={<Button type="button" variant="outline" />}
              disabled={saving}
            >
              Отмена
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner /> : null}
              {post ? "Сохранить" : "Опубликовать"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
