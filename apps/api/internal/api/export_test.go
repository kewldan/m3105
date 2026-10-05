package api

import "context"

// SetSocialWriteLimit overrides the anti-spam limit in tests and returns the previous value.
func SetSocialWriteLimit(n int) int {
	prev := socialWriteLimit
	socialWriteLimit = n
	return prev
}

// SetUploadLimit overrides the per-student upload limit in tests and returns the previous value.
func SetUploadLimit(n int) int {
	prev := uploadLimit
	uploadLimit = n
	return prev
}

// TagsForPath exposes the cache-tag mapping to the contract test.
var TagsForPath = tagsForPath

// SetAvatarFetcher replaces the Telegram photo download in tests and returns the previous one.
func SetAvatarFetcher(fn func(ctx context.Context, url string) ([]byte, error)) func(ctx context.Context, url string) ([]byte, error) {
	prev := fetchAvatar
	fetchAvatar = fn
	return prev
}
