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
	TargetPost CommentTarget = "post"
)

// ParseCommentTarget validates a target name from the URL.
func ParseCommentTarget(raw string) (CommentTarget, bool) {
	switch CommentTarget(raw) {
	case TargetNote, TargetLab, TargetPost:
		return CommentTarget(raw), true
	}
	return "", false
}

// Comment is a student's message under a note, lab or post.
type Comment struct {
	ID         int64         `db:"id" json:"id"`
	TargetType CommentTarget `db:"target_type" json:"targetType"`
	TargetID   int64         `db:"target_id" json:"targetId"`
	Body       string        `db:"body" json:"body"`
	CreatedAt  time.Time     `db:"created_at" json:"createdAt"`
	UpdatedAt  time.Time     `db:"updated_at" json:"updatedAt"`

	AuthorID       int64  `db:"author_id" json:"authorId"`
	AuthorName     string `db:"author_name" json:"authorName"`
	AuthorPhotoURL string `db:"author_photo_url" json:"authorPhotoUrl"`
	// Mine is true for the signed-in viewer's own comments.
	Mine bool `db:"-" json:"mine"`
}

// AdminComment adds where the comment lives for the moderation list.
type AdminComment struct {
	Comment
	TargetTitle string `db:"target_title" json:"targetTitle"`
	TargetPath  string `db:"target_path" json:"targetPath"`
}

// CommentInput is the create payload.
type CommentInput struct {
	Body string `json:"body"`
}

const maxCommentLen = 2000

// Validate trims and checks the body.
func (in *CommentInput) Validate() error {
	ve := httpx.NewValidation()
	in.Body = strings.TrimSpace(in.Body)
	if in.Body == "" {
		ve.Add("body", "Напишите что-нибудь")
	} else if utf8.RuneCountInString(in.Body) > maxCommentLen {
		ve.Add("body", "Не больше 2000 символов")
	}
	if !ve.Empty() {
		return ve
	}
	return nil
}

// ---------- Posts ----------

// PostKind separates the feeds.
type PostKind string

const (
	PostShawarma PostKind = "shawarma"
	PostJoke     PostKind = "joke"
)

// PostVisibility decides who sees the post.
type PostVisibility string

const (
	// VisiblePublic is visible to everyone, including anonymous visitors.
	VisiblePublic PostVisibility = "public"
	// VisibleMembers is visible only to signed-in students.
	VisibleMembers PostVisibility = "members"
)

// ParsePostVisibility validates a visibility from a body; empty means public.
func ParsePostVisibility(raw string) (PostVisibility, bool) {
	switch PostVisibility(raw) {
	case "":
		return VisiblePublic, true
	case VisiblePublic, VisibleMembers:
		return PostVisibility(raw), true
	}
	return "", false
}

// ParsePostKind validates a kind from a query or body.
func ParsePostKind(raw string) (PostKind, bool) {
	switch PostKind(raw) {
	case PostShawarma, PostJoke:
		return PostKind(raw), true
	}
	return "", false
}

// Post is a user-submitted entry in one of the feeds.
type Post struct {
	ID      int64    `db:"id" json:"id"`
	Kind    PostKind `db:"kind" json:"kind"`
	Title   string   `db:"title" json:"title"`
	Body    string   `db:"body" json:"body"`
	Address string   `db:"address" json:"address"`
	Price   *int     `db:"price" json:"price"`
	Rating  *int     `db:"rating" json:"rating"`
	// Visibility "members" hides the post from anonymous visitors; NSFW marks
	// it 18+ so the site blurs it until the reader confirms their age.
	Visibility PostVisibility `db:"visibility" json:"visibility"`
	NSFW       bool           `db:"nsfw" json:"nsfw"`
	CreatedAt  time.Time      `db:"created_at" json:"createdAt"`
	UpdatedAt  time.Time      `db:"updated_at" json:"updatedAt"`

	AuthorID       int64  `db:"author_id" json:"authorId"`
	AuthorName     string `db:"author_name" json:"authorName"`
	AuthorPhotoURL string `db:"author_photo_url" json:"authorPhotoUrl"`
	LikesCount     int    `db:"likes_count" json:"likesCount"`
	CommentsCount  int    `db:"comments_count" json:"commentsCount"`
	// Liked and Mine are relative to the signed-in viewer.
	Liked bool `db:"liked" json:"liked"`
	Mine  bool `db:"-" json:"mine"`
}

// PostInput is the create/update payload for students and admins.
type PostInput struct {
	Kind       PostKind       `json:"kind"`
	Title      string         `json:"title"`
	Body       string         `json:"body"`
	Address    string         `json:"address"`
	Price      *int           `json:"price"`
	Rating     *int           `json:"rating"`
	Visibility PostVisibility `json:"visibility"`
	NSFW       bool           `json:"nsfw"`
}

const (
	maxPostTitleLen   = 120
	maxPostBodyLen    = 4000
	maxPostAddressLen = 200
	maxPostPrice      = 100000
)

// Validate trims strings and enforces per-kind rules: shawarma reviews need a
// place name and a rating, jokes carry only text.
func (in *PostInput) Validate() error {
	ve := httpx.NewValidation()
	in.Title = strings.TrimSpace(in.Title)
	in.Body = strings.TrimSpace(in.Body)
	in.Address = strings.TrimSpace(in.Address)
	if _, ok := ParsePostKind(string(in.Kind)); !ok {
		ve.Add("kind", "Неизвестный тип поста")
		return ve
	}
	visibility, ok := ParsePostVisibility(string(in.Visibility))
	if !ok {
		ve.Add("visibility", "Неизвестная видимость")
		return ve
	}
	in.Visibility = visibility
	// 18+ смотрят только вошедшие: NSFW всегда «для своих».
	if in.NSFW {
		in.Visibility = VisibleMembers
	}
	if utf8.RuneCountInString(in.Title) > maxPostTitleLen {
		ve.Add("title", "Не больше 120 символов")
	}
	if in.Body == "" {
		ve.Add("body", "Напишите текст")
	} else if utf8.RuneCountInString(in.Body) > maxPostBodyLen {
		ve.Add("body", "Не больше 4000 символов")
	}
	switch in.Kind {
	case PostShawarma:
		if in.Title == "" {
			ve.Add("title", "Укажите название точки")
		}
		if utf8.RuneCountInString(in.Address) > maxPostAddressLen {
			ve.Add("address", "Не больше 200 символов")
		}
		if in.Rating == nil {
			ve.Add("rating", "Поставьте оценку")
		} else if *in.Rating < 1 || *in.Rating > 5 {
			ve.Add("rating", "Оценка от 1 до 5")
		}
		if in.Price != nil && (*in.Price < 0 || *in.Price > maxPostPrice) {
			ve.Add("price", "Укажите реальную цену")
		}
	case PostJoke:
		in.Address = ""
		in.Price = nil
		in.Rating = nil
	}
	if !ve.Empty() {
		return ve
	}
	return nil
}
