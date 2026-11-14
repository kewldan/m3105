package bot

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/models"
	"github.com/kewldan/edu3105/apps/api/internal/store"
)

// Notifier sends students messages caused by actions on the site (swap
// requests in the practice queue, canceled or moved sessions). Every send is
// written to the broadcast journal.
type Notifier struct {
	c    *courier
	site string
}

// NewNotifier returns nil without a bot token; methods of a nil notifier do nothing.
func NewNotifier(token, site string, st *store.Store) *Notifier {
	if token == "" {
		return nil
	}
	return &Notifier{
		c:    &courier{api: NewClient(token), store: st, log: slog.Default().With("component", "notify")},
		site: site,
	}
}

// broadcast delivers one text to the recipients in the background. A student
// may never have started the bot: Telegram then refuses, and the journal keeps
// the reason.
func (n *Notifier) broadcast(b store.NewBroadcast, to []Recipient, text string, keyboard map[string]any) {
	if n == nil || len(to) == 0 {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		id := n.c.open(ctx, b)
		var markup any
		if keyboard != nil {
			markup = keyboard
		}
		for i, r := range to {
			if i > 0 {
				time.Sleep(50 * time.Millisecond)
			}
			if err := n.c.deliver(ctx, id, r, text, markup); err != nil && !errors.Is(err, errNoChat) {
				n.c.log.Warn("send", "broadcast", id, "user", r.UserID, "err", err)
			}
		}
	}()
}

// Retry resends the failed deliveries of a broadcast, synchronously.
func (n *Notifier) Retry(ctx context.Context, broadcastID int64) (RetryResult, error) {
	return n.c.retry(ctx, broadcastID)
}

// SwapPlace is a defense in the queue: its 1-based place and lab number.
type SwapPlace struct{ Place, Lab int }

// SwapRequested asks the receiver to agree to a swap, with buttons to answer
// right in Telegram.
func (n *Notifier) SwapRequested(to Recipient, swapID int64, sess models.PracticeSession, loc *time.Location, from string, theirs, yours SwapPlace) {
	if n == nil {
		return
	}
	n.broadcast(practiceBroadcast(models.BroadcastSwap, "Обмен: запрос", sess, loc), []Recipient{to},
		swapRequestMessage(n.site, sess, loc, from, theirs, yours), swapKeyboard(swapID))
}

// SwapDeclined tells the sender the receiver said no.
func (n *Notifier) SwapDeclined(to Recipient, sess models.PracticeSession, loc *time.Location, with string) {
	if n == nil {
		return
	}
	n.broadcast(practiceBroadcast(models.BroadcastSwap, "Обмен: отказ", sess, loc), []Recipient{to},
		swapDeclinedMessage(n.site, sess, loc, with), nil)
}

// SwapAccepted tells the sender the swap went through.
func (n *Notifier) SwapAccepted(to Recipient, sess models.PracticeSession, loc *time.Location, with string, place int) {
	if n == nil {
		return
	}
	n.broadcast(practiceBroadcast(models.BroadcastSwap, "Обмен: согласие", sess, loc), []Recipient{to},
		swapAcceptedMessage(n.site, sess, loc, with, place), nil)
}

// PracticeCanceled tells the signed-up students their session is canceled.
func (n *Notifier) PracticeCanceled(to []Recipient, sess models.PracticeSession, loc *time.Location, moved, next *models.PracticeSession) {
	if n == nil {
		return
	}
	n.broadcast(practiceBroadcast(models.BroadcastPracticeCanceled, "Отмена сдачи", sess, loc), to,
		practiceCanceledMessage(n.site, sess, loc, moved, next), nil)
}

// PracticeMoved tells the signed-up students the session changed time or room.
func (n *Notifier) PracticeMoved(to []Recipient, before, after models.PracticeSession, loc *time.Location) {
	if n == nil {
		return
	}
	n.broadcast(practiceBroadcast(models.BroadcastPracticeMoved, "Перенос сдачи", after, loc), to,
		practiceMovedMessage(n.site, before, after, loc), nil)
}

// PracticeRestored tells the signed-up students a canceled session is back.
func (n *Notifier) PracticeRestored(to []Recipient, sess models.PracticeSession, loc *time.Location) {
	if n == nil {
		return
	}
	n.broadcast(practiceBroadcast(models.BroadcastPracticeRestored, "Сдача снова в силе", sess, loc), to,
		practiceRestoredMessage(n.site, sess, loc), nil)
}
