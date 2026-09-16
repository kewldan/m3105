package api

// SetSocialWriteLimit overrides the anti-spam limit in tests and returns the previous value.
func SetSocialWriteLimit(n int) int {
	prev := socialWriteLimit
	socialWriteLimit = n
	return prev
}

// TagsForPath exposes the cache-tag mapping to the contract test.
var TagsForPath = tagsForPath
