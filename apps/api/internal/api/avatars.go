package api

import (
	"context"
	"log/slog"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/files"
	"github.com/kewldan/edu3105/apps/api/internal/store"
)

// Аватарки. Telegram отдаёт в photo_url ссылку на своём CDN, а браузеры
// студентов ходят туда плохо (у кого-то CDN режется, у кого-то лимиты), поэтому
// при входе API один раз копирует фото к себе: то же хранилище, что и у
// вложений, scope = 'avatar', отдаётся через /files/{id}/… с превью ?w=.
// Любая неудача (нет фото, чужой хост, битая или анимированная картинка, сеть)
// оставляет прежнюю аватарку или инициалы: вход из-за неё не ломается.

const avatarTimeout = 30 * time.Second

// fetchAvatar is a variable so tests can serve photos without reaching Telegram.
var fetchAvatar = files.FetchAvatar

// syncAvatar brings the stored avatar in line with the Telegram photo address.
func (h *Handler) syncAvatar(ctx context.Context, userID int64, photoURL string) {
	if h.files == nil {
		return
	}
	cur, err := h.store.GetUserAvatar(ctx, userID)
	if err != nil {
		slog.Warn("avatar: read state", "user", userID, "err", err)
		return
	}
	if photoURL == "" {
		// Фото в Telegram убрали или его не было — инициалы.
		if cur.ID == "" {
			return
		}
		old, err := h.store.ClearAvatar(ctx, userID)
		if err != nil {
			slog.Warn("avatar: clear", "user", userID, "err", err)
			return
		}
		h.dropAvatarObject(ctx, old)
		return
	}
	if cur.ID != "" && cur.Source == photoURL {
		return
	}
	data, err := fetchAvatar(ctx, photoURL)
	if err != nil {
		slog.Warn("avatar: download", "user", userID, "err", err)
		return
	}
	p, err := files.PrepareAvatar(data)
	if err != nil {
		slog.Warn("avatar: unusable picture", "user", userID, "err", err)
		return
	}
	id := files.NewID()
	if err := h.files.Put(ctx, id, p.ContentType, p.Data); err != nil {
		slog.Warn("avatar: store", "user", userID, "err", err)
		return
	}
	old, err := h.store.SetAvatar(ctx, userID, photoURL, store.NewAttachment{
		ID: id, Name: p.Name, Slug: "avatar", ContentType: p.ContentType, SHA256: p.SHA256,
		Size: int64(len(p.Data)), Width: p.Width, Height: p.Height, Scope: "avatar",
	})
	if err != nil {
		slog.Warn("avatar: record", "user", userID, "err", err)
		h.dropAvatarObject(ctx, id)
		return
	}
	h.dropAvatarObject(ctx, old)
}

func (h *Handler) dropAvatarObject(ctx context.Context, id string) {
	if id == "" {
		return
	}
	// Не вышло — объект уберёт сборщик мусора.
	if err := h.files.Delete(ctx, id); err != nil {
		slog.Warn("avatar: delete object", "id", id, "err", err)
	}
}

// syncAvatarSoon runs syncAvatar in the background and waits for it for a
// moment, so a first sign-in usually returns the finished avatar while a slow
// Telegram CDN never holds the login up.
func (h *Handler) syncAvatarSoon(ctx context.Context, userID int64, photoURL string) {
	if h.files == nil {
		return
	}
	done := make(chan struct{})
	go func() {
		defer close(done)
		bg, cancel := context.WithTimeout(context.WithoutCancel(ctx), avatarTimeout)
		defer cancel()
		h.syncAvatar(bg, userID, photoURL)
	}()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
	}
}

// BackfillAvatars copies Telegram photos of accounts created before avatars
// were stored. One pass at start, slowly: Telegram throttles bursts.
func (h *Handler) BackfillAvatars(ctx context.Context) {
	if h.files == nil {
		return
	}
	users, err := h.store.UsersWithoutAvatar(ctx, 1000)
	if err != nil {
		slog.Warn("avatar backfill", "err", err)
		return
	}
	done := 0
	for _, u := range users {
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Second):
		}
		bg, cancel := context.WithTimeout(ctx, avatarTimeout)
		h.syncAvatar(bg, u.ID, u.PhotoURL)
		cancel()
		done++
	}
	if done > 0 {
		slog.Info("avatar backfill", "checked", done)
	}
}
