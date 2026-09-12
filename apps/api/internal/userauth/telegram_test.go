package userauth

import (
	"testing"
	"time"
)

func TestVerifyTelegram(t *testing.T) {
	token := "123456:ABC-DEF"
	now := time.Now()
	d := TelegramData{ID: 42, FirstName: "Иван", LastName: "Петров", Username: "ivan", PhotoURL: "https://t.me/i/userpic/320/x.jpg", AuthDate: now.Unix()}
	d.Hash = SignTelegram(token, d)
	if err := VerifyTelegram(token, d, now, 24*time.Hour); err != nil {
		t.Fatalf("expected valid signature: %v", err)
	}
	bad := d
	bad.FirstName = "Пётр"
	if err := VerifyTelegram(token, bad, now, 24*time.Hour); err != ErrBadTelegramSignature {
		t.Fatalf("expected bad signature, got %v", err)
	}
	old := TelegramData{ID: 1, FirstName: "X", AuthDate: now.Add(-48 * time.Hour).Unix()}
	old.Hash = SignTelegram(token, old)
	if err := VerifyTelegram(token, old, now, 24*time.Hour); err != ErrTelegramExpired {
		t.Fatalf("expected expired, got %v", err)
	}
	if err := VerifyTelegram("", d, now, time.Hour); err == nil {
		t.Fatal("expected error without token")
	}
	if d.DisplayName() != "Иван Петров" {
		t.Fatalf("unexpected display name %q", d.DisplayName())
	}
}
