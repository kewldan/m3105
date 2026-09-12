// Package userauth implements student sign-in via Telegram Login and passkeys.
package userauth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"sort"
	"strconv"
	"strings"
	"time"
)

// TelegramData is the payload the Telegram Login Widget hands to the page.
type TelegramData struct {
	ID        int64  `json:"id"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Username  string `json:"username"`
	PhotoURL  string `json:"photo_url"`
	AuthDate  int64  `json:"auth_date"`
	Hash      string `json:"hash"`
}

// ErrBadTelegramSignature is returned when the HMAC does not match.
var ErrBadTelegramSignature = errors.New("bad telegram signature")

// ErrTelegramExpired is returned when auth_date is too old.
var ErrTelegramExpired = errors.New("telegram login expired")

// DisplayName joins first and last names.
func (d TelegramData) DisplayName() string {
	name := strings.TrimSpace(strings.TrimSpace(d.FirstName) + " " + strings.TrimSpace(d.LastName))
	if name == "" {
		name = "@" + d.Username
	}
	return name
}

// VerifyTelegram checks the widget signature as documented at
// https://core.telegram.org/widgets/login#checking-authorization.
func VerifyTelegram(botToken string, d TelegramData, now time.Time, maxAge time.Duration) error {
	if botToken == "" {
		return errors.New("telegram login is not configured")
	}
	fields := map[string]string{
		"id":        strconv.FormatInt(d.ID, 10),
		"auth_date": strconv.FormatInt(d.AuthDate, 10),
	}
	if d.FirstName != "" {
		fields["first_name"] = d.FirstName
	}
	if d.LastName != "" {
		fields["last_name"] = d.LastName
	}
	if d.Username != "" {
		fields["username"] = d.Username
	}
	if d.PhotoURL != "" {
		fields["photo_url"] = d.PhotoURL
	}
	keys := make([]string, 0, len(fields))
	for k := range fields {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, k+"="+fields[k])
	}
	check := strings.Join(parts, "\n")

	secret := sha256.Sum256([]byte(botToken))
	mac := hmac.New(sha256.New, secret[:])
	mac.Write([]byte(check))
	want := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(want), []byte(strings.ToLower(d.Hash))) {
		return ErrBadTelegramSignature
	}
	if maxAge > 0 && now.Sub(time.Unix(d.AuthDate, 0)) > maxAge {
		return ErrTelegramExpired
	}
	return nil
}

// SignTelegram computes the widget hash; used by tests and the dev helper.
func SignTelegram(botToken string, d TelegramData) string {
	fields := map[string]string{
		"id":        strconv.FormatInt(d.ID, 10),
		"auth_date": strconv.FormatInt(d.AuthDate, 10),
	}
	if d.FirstName != "" {
		fields["first_name"] = d.FirstName
	}
	if d.LastName != "" {
		fields["last_name"] = d.LastName
	}
	if d.Username != "" {
		fields["username"] = d.Username
	}
	if d.PhotoURL != "" {
		fields["photo_url"] = d.PhotoURL
	}
	keys := make([]string, 0, len(fields))
	for k := range fields {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, k+"="+fields[k])
	}
	secret := sha256.Sum256([]byte(botToken))
	mac := hmac.New(sha256.New, secret[:])
	mac.Write([]byte(strings.Join(parts, "\n")))
	return hex.EncodeToString(mac.Sum(nil))
}
