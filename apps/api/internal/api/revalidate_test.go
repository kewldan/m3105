package api

import (
	"slices"
	"testing"
)

func TestTagsForPath(t *testing.T) {
	cases := []struct {
		path string
		want []string
	}{
		{"/api/v1/admin/notes", []string{"notes", "home"}},
		{"/api/v1/admin/notes/12", []string{"notes", "home"}},
		{"/api/v1/admin/settings", []string{"settings", "home"}},
		{"/api/v1/admin/pages/3", []string{"pages", "settings"}},
		{"/api/v1/admin/quizzes/7", []string{"quizzes", "notes", "home"}},
		{"/api/v1/admin/users/4", nil},
		{"/api/v1/admin/posts/4", nil},
		{"/api/v1/notes", nil},
		{"/healthz", nil},
	}
	for _, c := range cases {
		if got := tagsForPath(c.path); !slices.Equal(got, c.want) {
			t.Fatalf("tagsForPath(%q) = %v, want %v", c.path, got, c.want)
		}
	}
}
