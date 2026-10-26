package bot

import (
	"context"
	"log/slog"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/models"
)

// Notifier sends students messages caused by other students' actions on the
// site (swap requests in the practice queue).
type Notifier struct {
	api  *Client
	site string
	log  *slog.Logger
}

// NewNotifier returns nil without a bot token; methods of a nil notifier do nothing.
func NewNotifier(token, site string) *Notifier {
	if token == "" {
		return nil
	}
	return &Notifier{api: NewClient(token), site: site, log: slog.Default().With("component", "notify")}
}

// send delivers the message in the background. The student may never have
// started the bot: Telegram then refuses and the failure is only logged.
func (n *Notifier) send(to *int64, text string) {
	if n == nil || to == nil {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := n.api.SendHTML(ctx, *to, text, SendOptions{DisablePreview: true}); err != nil {
			n.log.Warn("send", "chat", *to, "err", err)
		}
	}()
}

// SwapPlace is a defense in the queue: its 1-based place and lab number.
type SwapPlace struct{ Place, Lab int }

// SwapRequested asks the receiver to agree to a swap.
func (n *Notifier) SwapRequested(to *int64, sess models.PracticeSession, loc *time.Location, from string, theirs, yours SwapPlace) {
	if n == nil {
		return
	}
	n.send(to, swapRequestMessage(n.site, sess, loc, from, theirs, yours))
}

// SwapAccepted tells the sender the swap went through.
func (n *Notifier) SwapAccepted(to *int64, sess models.PracticeSession, loc *time.Location, with string, place int) {
	if n == nil {
		return
	}
	n.send(to, swapAcceptedMessage(n.site, sess, loc, with, place))
}
