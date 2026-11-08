package models

import (
	"slices"
	"strconv"
	"strings"
)

// Audience tokens say who a subject, lab, note, event or practice session is for:
// "stream:1" is the whole first stream, "group:М3105" one group. An empty list
// means everyone.
const (
	streamPrefix = "stream:"
	groupPrefix  = "group:"
)

// NormalizeAudience brings tokens to one spelling, drops duplicates and sorts
// them (streams first). It never returns nil: the column is NOT NULL.
func NormalizeAudience(in []string) (out []string, ok bool) {
	out = []string{}
	ok = true
	for _, raw := range in {
		t := strings.TrimSpace(raw)
		switch {
		case strings.HasPrefix(t, streamPrefix):
			n, err := strconv.Atoi(strings.TrimPrefix(t, streamPrefix))
			if err != nil || n < 1 || n > 99 {
				ok = false
				continue
			}
			t = streamPrefix + strconv.Itoa(n)
		case strings.HasPrefix(t, groupPrefix):
			g := NormalizeGroup(strings.TrimPrefix(t, groupPrefix))
			if g == "" || len([]rune(g)) > 40 {
				ok = false
				continue
			}
			t = groupPrefix + g
		default:
			ok = false
			continue
		}
		if !slices.Contains(out, t) {
			out = append(out, t)
		}
	}
	slices.SortFunc(out, func(a, b string) int {
		as, bs := strings.HasPrefix(a, streamPrefix), strings.HasPrefix(b, streamPrefix)
		if as != bs {
			if as {
				return -1
			}
			return 1
		}
		if as {
			x, _ := strconv.Atoi(strings.TrimPrefix(a, streamPrefix))
			y, _ := strconv.Atoi(strings.TrimPrefix(b, streamPrefix))
			return x - y
		}
		return strings.Compare(a, b)
	})
	return out, ok
}

// checkAudience normalises the field in place and reports a bad token.
func checkAudience(ve interface{ Add(field, msg string) }, a *[]string) {
	norm, ok := NormalizeAudience(*a)
	*a = norm
	if !ok {
		ve.Add("audience", "Аудитория — потоки (stream:1) и группы (group:М3105)")
	}
}

// AudienceOpen reports whether content with this audience is for a viewer
// whose own tokens (their group and its stream) are scope: content for
// everyone is, otherwise one token must match.
func AudienceOpen(audience, scope []string) bool {
	if len(audience) == 0 {
		return true
	}
	for _, t := range audience {
		if slices.Contains(scope, t) {
			return true
		}
	}
	return false
}
