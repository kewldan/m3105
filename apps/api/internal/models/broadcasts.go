package models

import (
	"encoding/json"
	"time"
)

// Broadcast kinds: what the bot was telling about.
const (
	BroadcastLab              = "lab"
	BroadcastDigest           = "digest"
	BroadcastGrades           = "grades"
	BroadcastPracticeCanceled = "practice_canceled"
	BroadcastPracticeMoved    = "practice_moved"
	BroadcastPracticeRestored = "practice_restored"
	BroadcastSwap             = "swap"
	BroadcastAdmin            = "admin"
)

// Delivery statuses. Pending is written before the send: a delivery stuck in
// it means the process died mid-broadcast.
const (
	DeliveryPending = "pending"
	DeliverySent    = "sent"
	DeliveryFailed  = "failed"
	DeliverySkipped = "skipped"
)

// Broadcast is one bot mailing with its delivery counters.
type Broadcast struct {
	ID        int64     `db:"id" json:"id"`
	Kind      string    `db:"kind" json:"kind"`
	Title     string    `db:"title" json:"title"`
	RefType   string    `db:"ref_type" json:"refType"`
	RefID     *int64    `db:"ref_id" json:"refId"`
	CreatedAt time.Time `db:"created_at" json:"createdAt"`
	// LastAt is the latest delivery change: retries move it.
	LastAt  time.Time `db:"last_at" json:"lastAt"`
	Total   int       `db:"total" json:"total"`
	Sent    int       `db:"sent" json:"sent"`
	Failed  int       `db:"failed" json:"failed"`
	Skipped int       `db:"skipped" json:"skipped"`
	Pending int       `db:"pending" json:"pending"`
}

// BroadcastDelivery is one recipient of a broadcast.
type BroadcastDelivery struct {
	ID          int64           `db:"id" json:"id"`
	BroadcastID int64           `db:"broadcast_id" json:"broadcastId"`
	UserID      *int64          `db:"user_id" json:"userId"`
	ChatID      *int64          `db:"chat_id" json:"chatId"`
	Recipient   string          `db:"recipient" json:"recipient"`
	GroupName   string          `db:"group_name" json:"groupName"`
	Status      string          `db:"status" json:"status"`
	Error       string          `db:"error" json:"error"`
	Text        string          `db:"text" json:"text"`
	Markup      json.RawMessage `db:"markup" json:"-"`
	Attempts    int             `db:"attempts" json:"attempts"`
	CreatedAt   time.Time       `db:"created_at" json:"createdAt"`
	UpdatedAt   time.Time       `db:"updated_at" json:"updatedAt"`
}

// BroadcastDetail is a broadcast with every recipient.
type BroadcastDetail struct {
	Broadcast
	Deliveries []BroadcastDelivery `json:"deliveries"`
}
