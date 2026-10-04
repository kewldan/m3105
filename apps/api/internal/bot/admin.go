package bot

import (
	"context"
	"log/slog"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/models"
)

// AdminNotifier sends service messages to the admin's chat.
type AdminNotifier struct {
	api    *Client
	chatID int64
	site   string
	log    *slog.Logger
}

// NewAdminNotifier returns nil when the token or the chat is not configured;
// methods of a nil notifier do nothing.
func NewAdminNotifier(token string, chatID int64, site string) *AdminNotifier {
	if token == "" || chatID == 0 {
		return nil
	}
	return &AdminNotifier{api: NewClient(token), chatID: chatID, site: site, log: slog.Default().With("component", "admin-notify")}
}

// NewUser reports a freshly created student account. It does not block the caller:
// the message goes out in the background and a failure is only logged.
func (n *AdminNotifier) NewUser(u models.User) {
	if n == nil {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := n.api.SendHTML(ctx, n.chatID, newUserMessage(n.site, u), SendOptions{DisablePreview: true}); err != nil {
			n.log.Warn("new user", "user", u.ID, "err", err)
		}
	}()
}
