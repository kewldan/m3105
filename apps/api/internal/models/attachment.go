package models

import (
	"time"

	"github.com/kewldan/edu3105/apps/api/internal/files"
	"github.com/kewldan/edu3105/apps/api/internal/httpx"
)

// MaxAttachments limits files on one comment or post.
const MaxAttachments = 6

// Attachment is a stored file: a photo under a comment, a PDF in a post, an
// image in a note.
type Attachment struct {
	ID string `db:"id" json:"id"`
	// URL is relative to the site: /api/v1/files/{id}/{name}.
	URL         string    `db:"url" json:"url"`
	Name        string    `db:"name" json:"name"`
	ContentType string    `db:"content_type" json:"contentType"`
	Size        int64     `db:"size" json:"size"`
	Width       *int      `db:"width" json:"width"`
	Height      *int      `db:"height" json:"height"`
	CreatedAt   time.Time `db:"created_at" json:"createdAt"`
}

// AttachmentPlace says what a file belongs to.
type AttachmentPlace string

const (
	// PlaceContent is an admin upload linked from MDX texts.
	PlaceContent AttachmentPlace = "content"
	PlaceComment AttachmentPlace = "comment"
	PlacePost    AttachmentPlace = "post"
	// PlacePending is a student upload not attached to anything yet.
	PlacePending AttachmentPlace = "pending"
)

// ContentRef is a text that links to an admin file.
type ContentRef struct {
	Type  string `json:"type"`
	Title string `json:"title"`
	Path  string `json:"path"`
}

// AdminAttachment adds ownership and usage for the admin file list.
type AdminAttachment struct {
	Attachment
	Place       AttachmentPlace `db:"place" json:"place"`
	AuthorName  *string         `db:"author_name" json:"authorName"`
	TargetTitle *string         `db:"target_title" json:"targetTitle"`
	TargetPath  *string         `db:"target_path" json:"targetPath"`
	// UsedIn lists notes, labs, pages, FAQ answers and subjects whose text links
	// to the file (content files only).
	UsedIn []ContentRef `db:"used_in" json:"usedIn"`
}

// validateAttachmentIDs checks the list shape; ownership is checked by the store.
func validateAttachmentIDs(ve *httpx.ValidationError, ids []string) {
	if len(ids) > MaxAttachments {
		ve.Add("attachmentIds", "Не больше 6 файлов")
		return
	}
	seen := map[string]bool{}
	for _, id := range ids {
		if !files.ValidID(id) || seen[id] {
			ve.Add("attachmentIds", "Некорректный список файлов")
			return
		}
		seen[id] = true
	}
}
