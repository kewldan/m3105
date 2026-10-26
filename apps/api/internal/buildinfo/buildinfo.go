// Package buildinfo tells which commit the running binary was built from.
package buildinfo

import "runtime/debug"

// commit is set at build time: -ldflags "-X .../buildinfo.commit=<sha>".
var commit string

// Commit is the git commit of the build: the one passed by the Docker build,
// else the one Go stamped from the checkout (go build in a work tree), else "".
func Commit() string {
	if commit != "" {
		return commit
	}
	if info, ok := debug.ReadBuildInfo(); ok {
		for _, s := range info.Settings {
			if s.Key == "vcs.revision" {
				return s.Value
			}
		}
	}
	return ""
}
