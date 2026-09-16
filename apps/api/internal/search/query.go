// Package search turns what a человек набрал в строке поиска into a tsquery
// Postgres can run: слова режутся по небуквенным символам, последнее слово
// ищется по префиксу, чтобы поиск работал по мере набора.
package search

import (
	"strings"
	"unicode"
)

// maxTerms ограничивает длину запроса: больше восьми слов в поиске по сайту
// не бывает, а tsquery из сотни лексем — это уже DoS по процессору.
const maxTerms = 8

// ToTSQuery builds a prefix tsquery like `'линейн':* & 'алгебр':*`.
// Returns an empty string when there is nothing to search for.
func ToTSQuery(raw string) string {
	terms := make([]string, 0, maxTerms)
	for _, field := range strings.FieldsFunc(raw, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	}) {
		// Кавычки экранируем удвоением: лексема идёт в tsquery в одинарных кавычках.
		term := strings.ReplaceAll(field, "'", "''")
		if term == "" {
			continue
		}
		terms = append(terms, "'"+term+"':*")
		if len(terms) == maxTerms {
			break
		}
	}
	return strings.Join(terms, " & ")
}
