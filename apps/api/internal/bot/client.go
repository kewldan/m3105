// Package bot runs the Telegram bot: commands for students and notifications
// about new labs and upcoming deadlines.
package bot

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client is a minimal Telegram Bot API client.
type Client struct {
	base string
	hc   *http.Client
}

// NewClient builds a client for the bot token.
func NewClient(token string) *Client {
	return &Client{base: "https://api.telegram.org/bot" + token + "/", hc: &http.Client{Timeout: 70 * time.Second}}
}

// APIError is a non-ok Bot API response.
type APIError struct {
	Code        int    `json:"error_code"`
	Description string `json:"description"`
	Parameters  struct {
		RetryAfter int `json:"retry_after"`
	} `json:"parameters"`
}

func (e *APIError) Error() string { return fmt.Sprintf("telegram: %d %s", e.Code, e.Description) }

// Blocked reports whether the user blocked the bot or the chat is gone.
func (e *APIError) Blocked() bool {
	return e.Code == 403 || e.Code == 400 && e.Description == "Bad Request: chat not found"
}

func (c *Client) call(ctx context.Context, method string, params any, out any) error {
	body, err := json.Marshal(params)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.base+method, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := c.hc.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return err
	}
	var env struct {
		OK     bool            `json:"ok"`
		Result json.RawMessage `json:"result"`
		APIError
	}
	if err := json.Unmarshal(raw, &env); err != nil {
		return fmt.Errorf("telegram: bad response %d: %s", res.StatusCode, raw)
	}
	if !env.OK {
		return &env.APIError
	}
	if out != nil {
		return json.Unmarshal(env.Result, out)
	}
	return nil
}

// Update is the subset of Telegram updates the bot handles.
type Update struct {
	ID      int64    `json:"update_id"`
	Message *Message `json:"message"`
}

// Message is an incoming message.
type Message struct {
	Text string `json:"text"`
	Chat struct {
		ID   int64  `json:"id"`
		Type string `json:"type"`
	} `json:"chat"`
	From *struct {
		ID        int64  `json:"id"`
		FirstName string `json:"first_name"`
		Username  string `json:"username"`
	} `json:"from"`
}

// GetUpdates long-polls for new updates.
func (c *Client) GetUpdates(ctx context.Context, offset int64, timeoutSec int) ([]Update, error) {
	var out []Update
	err := c.call(ctx, "getUpdates", map[string]any{
		"offset": offset, "timeout": timeoutSec, "allowed_updates": []string{"message"},
	}, &out)
	return out, err
}

// SendOptions tune an outgoing message.
type SendOptions struct {
	ReplyMarkup any
	// DisablePreview hides link previews (on by default for digests).
	DisablePreview bool
}

// SendHTML sends an HTML-formatted message. Long texts are split at line boundaries.
func (c *Client) SendHTML(ctx context.Context, chatID int64, text string, opts SendOptions) error {
	for _, chunk := range splitMessage(text, 4000) {
		params := map[string]any{
			"chat_id": chatID, "text": chunk, "parse_mode": "HTML",
			"link_preview_options": map[string]any{"is_disabled": opts.DisablePreview},
		}
		if opts.ReplyMarkup != nil {
			params["reply_markup"] = opts.ReplyMarkup
		}
		if err := c.call(ctx, "sendMessage", params, nil); err != nil {
			var apiErr *APIError
			if errors.As(err, &apiErr) && apiErr.Code == 429 && apiErr.Parameters.RetryAfter > 0 {
				select {
				case <-time.After(time.Duration(apiErr.Parameters.RetryAfter) * time.Second):
				case <-ctx.Done():
					return ctx.Err()
				}
				if err := c.call(ctx, "sendMessage", params, nil); err != nil {
					return err
				}
				continue
			}
			return err
		}
	}
	return nil
}

// Command is an entry of the "/" menu.
type Command struct {
	Command     string `json:"command"`
	Description string `json:"description"`
}

// SetCommands publishes the command menu.
func (c *Client) SetCommands(ctx context.Context, cmds []Command) error {
	return c.call(ctx, "setMyCommands", map[string]any{"commands": cmds}, nil)
}

// splitMessage cuts text into chunks under the Telegram limit, preferring newlines.
func splitMessage(text string, limit int) []string {
	var parts []string
	for len(text) > limit {
		cut := bytes.LastIndexByte([]byte(text[:limit]), '\n')
		if cut < limit/2 {
			cut = limit
		}
		parts = append(parts, text[:cut])
		text = text[cut:]
		for len(text) > 0 && text[0] == '\n' {
			text = text[1:]
		}
	}
	if text != "" || len(parts) == 0 {
		parts = append(parts, text)
	}
	return parts
}
