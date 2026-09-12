// Package slug converts arbitrary (mostly Russian) titles into URL slugs.
package slug

import (
	"strings"
	"unicode"
)

var translit = map[rune]string{
	'а': "a", 'б': "b", 'в': "v", 'г': "g", 'д': "d", 'е': "e", 'ё': "yo", 'ж': "zh",
	'з': "z", 'и': "i", 'й': "y", 'к': "k", 'л': "l", 'м': "m", 'н': "n", 'о': "o",
	'п': "p", 'р': "r", 'с': "s", 'т': "t", 'у': "u", 'ф': "f", 'х': "h", 'ц': "ts",
	'ч': "ch", 'ш': "sh", 'щ': "sch", 'ъ': "", 'ы': "y", 'ь': "", 'э': "e", 'ю': "yu",
	'я': "ya",
}

// Make builds a lowercase ASCII slug from s. It returns "item" for inputs
// without any usable characters.
func Make(s string) string {
	var b strings.Builder
	lastDash := true
	for _, r := range strings.ToLower(strings.TrimSpace(s)) {
		var piece string
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			piece = string(r)
		case unicode.Is(unicode.Cyrillic, r):
			piece = translit[r]
			if piece == "" {
				continue // soft/hard signs carry no sound
			}
		default:
			piece = ""
		}
		if piece == "" {
			if !lastDash {
				b.WriteByte('-')
				lastDash = true
			}
			continue
		}
		b.WriteString(piece)
		lastDash = false
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "item"
	}
	if len(out) > 80 {
		out = strings.Trim(out[:80], "-")
	}
	return out
}

// Valid reports whether s is already a well-formed slug.
func Valid(s string) bool {
	if s == "" || len(s) > 80 {
		return false
	}
	for i, r := range s {
		ok := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || (r == '-' && i > 0 && i < len(s)-1)
		if !ok {
			return false
		}
	}
	return !strings.Contains(s, "--")
}
