// Package quiz defines the question format used by self-check quizzes and its
// validation rules. The same format is documented in docs/quiz-format.md.
package quiz

import (
	"fmt"
	"strings"
)

// Question types.
const (
	TypeSingle   = "single"   // exactly one correct option
	TypeMultiple = "multiple" // one or more correct options
	TypeText     = "text"     // free text compared against accepted answers
)

// Option is an answer choice for single/multiple questions.
type Option struct {
	ID      string `json:"id"`
	Text    string `json:"text"`
	Correct bool   `json:"correct"`
}

// Question is one quiz item.
type Question struct {
	ID          string   `json:"id"`
	Type        string   `json:"type"`
	Prompt      string   `json:"prompt"`
	Options     []Option `json:"options,omitempty"`
	Answers     []string `json:"answers,omitempty"`
	Explanation string   `json:"explanation,omitempty"`
	Points      int      `json:"points,omitempty"`
	Tags        []string `json:"tags,omitempty"`
}

// Validate checks a list of questions and normalises ids/points in place.
// It returns an empty string when the list is valid.
func Validate(qs []Question) string {
	seen := map[string]bool{}
	for i := range qs {
		q := &qs[i]
		label := fmt.Sprintf("Вопрос %d", i+1)
		q.Prompt = strings.TrimSpace(q.Prompt)
		q.Explanation = strings.TrimSpace(q.Explanation)
		if q.ID == "" {
			q.ID = fmt.Sprintf("q%d", i+1)
		}
		if seen[q.ID] {
			return label + ": повторяющийся id " + q.ID
		}
		seen[q.ID] = true
		if q.Prompt == "" {
			return label + ": пустой текст вопроса"
		}
		if q.Points <= 0 {
			q.Points = 1
		}
		switch q.Type {
		case TypeSingle, TypeMultiple:
			if len(q.Options) < 2 {
				return label + ": нужно минимум два варианта ответа"
			}
			correct := 0
			optSeen := map[string]bool{}
			for j := range q.Options {
				o := &q.Options[j]
				o.Text = strings.TrimSpace(o.Text)
				if o.ID == "" {
					o.ID = fmt.Sprintf("%s-%d", q.ID, j+1)
				}
				if optSeen[o.ID] {
					return fmt.Sprintf("%s: повторяющийся id варианта %s", label, o.ID)
				}
				optSeen[o.ID] = true
				if o.Text == "" {
					return fmt.Sprintf("%s: пустой вариант ответа №%d", label, j+1)
				}
				if o.Correct {
					correct++
				}
			}
			if q.Type == TypeSingle && correct != 1 {
				return label + ": для типа single должен быть ровно один верный вариант"
			}
			if q.Type == TypeMultiple && correct == 0 {
				return label + ": отметьте хотя бы один верный вариант"
			}
			q.Answers = nil
		case TypeText:
			cleaned := make([]string, 0, len(q.Answers))
			for _, a := range q.Answers {
				if a = strings.TrimSpace(a); a != "" {
					cleaned = append(cleaned, a)
				}
			}
			if len(cleaned) == 0 {
				return label + ": укажите хотя бы один принимаемый ответ"
			}
			q.Answers = cleaned
			q.Options = nil
		default:
			return label + ": неизвестный тип (single, multiple, text)"
		}
	}
	return ""
}
