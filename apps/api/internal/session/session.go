// Package session stores admin sessions and login rate limits, backed by
// Valkey in production and an in-memory map for local development.
package session

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sync"
	"time"

	"github.com/valkey-io/valkey-go"
)

// Store is the minimal interface the auth layer needs.
type Store interface {
	Create(ctx context.Context, ttl time.Duration) (string, error)
	Exists(ctx context.Context, token string) (bool, error)
	Delete(ctx context.Context, token string) error
	// Hit increments a rate-limit counter and returns the new value.
	Hit(ctx context.Context, key string, window time.Duration) (int64, error)
	// Put stores an arbitrary value under key with a TTL.
	Put(ctx context.Context, key, value string, ttl time.Duration) error
	// Fetch returns the value stored under key, and whether it exists.
	Fetch(ctx context.Context, key string) (string, bool, error)
	// Remove deletes key.
	Remove(ctx context.Context, key string) error
	Close()
}

// NewToken returns a random 64-hex-char token.
func NewToken() (string, error) { return newToken() }

func newToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// ---- in-memory ----

type memEntry struct {
	exp   time.Time
	value string
}

// Memory is a process-local Store for development and tests.
type Memory struct {
	mu       sync.Mutex
	sessions map[string]memEntry
	counters map[string]struct {
		n   int64
		exp time.Time
	}
}

// NewMemory constructs an empty in-memory store.
func NewMemory() *Memory {
	return &Memory{
		sessions: map[string]memEntry{},
		counters: map[string]struct {
			n   int64
			exp time.Time
		}{},
	}
}

func (m *Memory) Create(_ context.Context, ttl time.Duration) (string, error) {
	tok, err := newToken()
	if err != nil {
		return "", err
	}
	m.mu.Lock()
	m.sessions["session:"+tok] = memEntry{exp: time.Now().Add(ttl), value: "1"}
	m.mu.Unlock()
	return tok, nil
}

func (m *Memory) Exists(_ context.Context, token string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.sessions["session:"+token]
	if !ok {
		return false, nil
	}
	if time.Now().After(e.exp) {
		delete(m.sessions, "session:"+token)
		return false, nil
	}
	return true, nil
}

func (m *Memory) Delete(_ context.Context, token string) error {
	m.mu.Lock()
	delete(m.sessions, "session:"+token)
	m.mu.Unlock()
	return nil
}

func (m *Memory) Hit(_ context.Context, key string, window time.Duration) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c := m.counters[key]
	if time.Now().After(c.exp) {
		c.n = 0
		c.exp = time.Now().Add(window)
	}
	c.n++
	m.counters[key] = c
	return c.n, nil
}

func (m *Memory) Put(_ context.Context, key, value string, ttl time.Duration) error {
	m.mu.Lock()
	m.sessions[key] = memEntry{exp: time.Now().Add(ttl), value: value}
	m.mu.Unlock()
	return nil
}

func (m *Memory) Fetch(_ context.Context, key string) (string, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.sessions[key]
	if !ok {
		return "", false, nil
	}
	if time.Now().After(e.exp) {
		delete(m.sessions, key)
		return "", false, nil
	}
	return e.value, true, nil
}

func (m *Memory) Remove(_ context.Context, key string) error {
	m.mu.Lock()
	delete(m.sessions, key)
	m.mu.Unlock()
	return nil
}

func (m *Memory) Close() {}

// ---- valkey ----

// Valkey is a Store backed by a Valkey/Redis-compatible server.
type Valkey struct {
	client valkey.Client
}

// NewValkey connects to the given address and verifies the connection.
func NewValkey(ctx context.Context, addr, password string) (*Valkey, error) {
	client, err := valkey.NewClient(valkey.ClientOption{
		InitAddress: []string{addr},
		Password:    password,
	})
	if err != nil {
		return nil, fmt.Errorf("valkey client: %w", err)
	}
	var lastErr error
	for attempt := 0; attempt < 30; attempt++ {
		pingCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		lastErr = client.Do(pingCtx, client.B().Ping().Build()).Error()
		cancel()
		if lastErr == nil {
			return &Valkey{client: client}, nil
		}
		select {
		case <-ctx.Done():
			client.Close()
			return nil, ctx.Err()
		case <-time.After(time.Second):
		}
	}
	client.Close()
	return nil, fmt.Errorf("valkey not reachable: %w", lastErr)
}

func (v *Valkey) Create(ctx context.Context, ttl time.Duration) (string, error) {
	tok, err := newToken()
	if err != nil {
		return "", err
	}
	cmd := v.client.B().Set().Key("session:" + tok).Value("1").Ex(ttl).Build()
	if err := v.client.Do(ctx, cmd).Error(); err != nil {
		return "", err
	}
	return tok, nil
}

func (v *Valkey) Exists(ctx context.Context, token string) (bool, error) {
	n, err := v.client.Do(ctx, v.client.B().Exists().Key("session:"+token).Build()).AsInt64()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

func (v *Valkey) Delete(ctx context.Context, token string) error {
	return v.client.Do(ctx, v.client.B().Del().Key("session:"+token).Build()).Error()
}

func (v *Valkey) Hit(ctx context.Context, key string, window time.Duration) (int64, error) {
	n, err := v.client.Do(ctx, v.client.B().Incr().Key(key).Build()).AsInt64()
	if err != nil {
		return 0, err
	}
	if n == 1 {
		_ = v.client.Do(ctx, v.client.B().Expire().Key(key).Seconds(int64(window.Seconds())).Build()).Error()
	}
	return n, nil
}

func (v *Valkey) Put(ctx context.Context, key, value string, ttl time.Duration) error {
	return v.client.Do(ctx, v.client.B().Set().Key(key).Value(value).Ex(ttl).Build()).Error()
}

func (v *Valkey) Fetch(ctx context.Context, key string) (string, bool, error) {
	val, err := v.client.Do(ctx, v.client.B().Get().Key(key).Build()).ToString()
	if err != nil {
		if valkey.IsValkeyNil(err) {
			return "", false, nil
		}
		return "", false, err
	}
	return val, true, nil
}

func (v *Valkey) Remove(ctx context.Context, key string) error {
	return v.client.Do(ctx, v.client.B().Del().Key(key).Build()).Error()
}

func (v *Valkey) Close() { v.client.Close() }
