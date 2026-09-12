package slug

import "testing"

func TestMake(t *testing.T) {
	cases := map[string]string{
		"Лабораторная работа №1: Введение": "laboratornaya-rabota-1-vvedenie",
		"  Hello, World!  ": "hello-world",
		"Щука и ёж":         "schuka-i-yozh",
		"":                  "item",
		"!!!":               "item",
		"Объектно-ориентированное программирование": "obektno-orientirovannoe-programmirovanie",
	}
	for in, want := range cases {
		if got := Make(in); got != want {
			t.Errorf("Make(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestValid(t *testing.T) {
	for _, ok := range []string{"a", "lab-1", "x1-y2"} {
		if !Valid(ok) {
			t.Errorf("expected %q valid", ok)
		}
	}
	for _, bad := range []string{"", "-a", "a-", "a--b", "Ab", "с", "a b"} {
		if Valid(bad) {
			t.Errorf("expected %q invalid", bad)
		}
	}
}
