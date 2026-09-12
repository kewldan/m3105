package quiz

import "testing"

func TestValidate(t *testing.T) {
	ok := []Question{
		{Type: TypeSingle, Prompt: "2+2?", Options: []Option{{Text: "4", Correct: true}, {Text: "5"}}},
		{Type: TypeMultiple, Prompt: "Чётные?", Options: []Option{{Text: "2", Correct: true}, {Text: "4", Correct: true}, {Text: "3"}}},
		{Type: TypeText, Prompt: "Столица?", Answers: []string{" Москва "}},
	}
	if msg := Validate(ok); msg != "" {
		t.Fatalf("unexpected error: %s", msg)
	}
	if ok[0].ID != "q1" || ok[0].Options[0].ID != "q1-1" || ok[0].Points != 1 {
		t.Errorf("ids/points not normalised: %+v", ok[0])
	}
	if ok[2].Answers[0] != "Москва" {
		t.Errorf("answers not trimmed: %+v", ok[2].Answers)
	}

	bad := [][]Question{
		{{Type: TypeSingle, Prompt: "x", Options: []Option{{Text: "a"}, {Text: "b"}}}},
		{{Type: TypeSingle, Prompt: "x", Options: []Option{{Text: "a", Correct: true}, {Text: "b", Correct: true}}}},
		{{Type: TypeMultiple, Prompt: "x", Options: []Option{{Text: "a"}}}},
		{{Type: TypeText, Prompt: "x"}},
		{{Type: "weird", Prompt: "x"}},
		{{Type: TypeText, Prompt: "", Answers: []string{"a"}}},
		{{ID: "a", Type: TypeText, Prompt: "x", Answers: []string{"a"}}, {ID: "a", Type: TypeText, Prompt: "y", Answers: []string{"b"}}},
	}
	for i, qs := range bad {
		if msg := Validate(qs); msg == "" {
			t.Errorf("case %d: expected validation error", i)
		}
	}
}
