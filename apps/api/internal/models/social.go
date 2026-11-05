package models

import (
	"strings"
	"time"
	"unicode/utf8"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
)

// ---------- Comments ----------

// CommentTarget is what a comment is attached to.
type CommentTarget string

const (
	TargetNote CommentTarget = "note"
	TargetLab  CommentTarget = "lab"
)

// ParseCommentTarget validates a target name from the URL.
func ParseCommentTarget(raw string) (CommentTarget, bool) {
	switch CommentTarget(raw) {
	case TargetNote, TargetLab:
		return CommentTarget(raw), true
	}
	return "", false
}

// Comment is a student's message under a note or lab.
type Comment struct {
	ID         int64         `db:"id" json:"id"`
	TargetType CommentTarget `db:"target_type" json:"targetType"`
	TargetID   int64         `db:"target_id" json:"targetId"`
	Body       string        `db:"body" json:"body"`
	CreatedAt  time.Time     `db:"created_at" json:"createdAt"`
	UpdatedAt  time.Time     `db:"updated_at" json:"updatedAt"`

	AuthorID       int64        `db:"author_id" json:"authorId"`
	AuthorName     string       `db:"author_name" json:"authorName"`
	AuthorPhotoURL string       `db:"author_photo_url" json:"authorPhotoUrl"`
	AuthorGroup    string       `db:"author_group" json:"authorGroup"`
	Attachments    []Attachment `db:"attachments" json:"attachments"`
	// Mine is true for the signed-in viewer's own comments.
	Mine bool `db:"-" json:"mine"`
}

// AdminComment adds where the comment lives for the moderation list.
type AdminComment struct {
	Comment
	TargetTitle string `db:"target_title" json:"targetTitle"`
	TargetPath  string `db:"target_path" json:"targetPath"`
}

// CommentInput is the create payload. AttachmentIDs are the author's own
// uploads from POST /files, not yet attached anywhere.
type CommentInput struct {
	Body          string   `json:"body"`
	AttachmentIDs []string `json:"attachmentIds"`
}

const maxCommentLen = 2000

// Validate trims and checks the body.
func (in *CommentInput) Validate() error {
	ve := httpx.NewValidation()
	in.Body = strings.TrimSpace(in.Body)
	// Фото без подписи — тоже комментарий.
	if in.Body == "" && len(in.AttachmentIDs) == 0 {
		ve.Add("body", "Напишите что-нибудь")
	} else if utf8.RuneCountInString(in.Body) > maxCommentLen {
		ve.Add("body", "Не больше 2000 символов")
	}
	validateAttachmentIDs(ve, in.AttachmentIDs)
	if !ve.Empty() {
		return ve
	}
	return nil
}
