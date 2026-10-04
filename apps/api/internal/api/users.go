package api

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"hash/fnv"
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
	"github.com/kewldan/edu3105/apps/api/internal/queue"
	"github.com/kewldan/edu3105/apps/api/internal/store"
	"github.com/kewldan/edu3105/apps/api/internal/userauth"
)

func randomHandle() ([]byte, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	return b, nil
}

// requireApproved gates student write actions until an admin has confirmed the
// account's group membership. Reading and the profile itself stay available.
func (h *Handler) requireApproved(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, ok := userauth.UserID(r.Context())
		if !ok {
			httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Войдите, чтобы продолжить")
			return
		}
		user, err := h.store.GetUser(r.Context(), id)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		if !user.Approved {
			httpx.Error(w, http.StatusForbidden, "not_approved", "Аккаунт ещё не подтверждён администратором")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// meBundle assembles the profile response.
func (h *Handler) meBundle(r *http.Request, userID int64) (models.MeResponse, error) {
	ctx := r.Context()
	user, err := h.store.GetUser(ctx, userID)
	if err != nil {
		return models.MeResponse{}, err
	}
	completed, err := h.store.ListCompletedLabIDs(ctx, userID)
	if err != nil {
		return models.MeResponse{}, err
	}
	rows, err := h.store.ListUserSignups(ctx, userID)
	if err != nil {
		return models.MeResponse{}, err
	}
	signups := []models.MySignup{}
	bySession := map[int64]int{}
	for _, row := range rows {
		idx, ok := bySession[row.SessionID]
		if !ok {
			sess, err := h.store.GetPracticeSession(ctx, row.SessionID)
			if err != nil {
				return models.MeResponse{}, err
			}
			signups = append(signups, models.MySignup{Session: sess, Labs: []models.LabRef{}})
			idx = len(signups) - 1
			bySession[row.SessionID] = idx
		}
		signups[idx].Labs = append(signups[idx].Labs, models.LabRef{ID: row.LabID, Number: row.LabNumber, Title: row.LabTitle, Slug: row.LabSlug, SubjectSlug: row.SubjectSlug})
	}
	sort.SliceStable(signups, func(i, j int) bool { return signups[i].Session.StartsAt.Before(signups[j].Session.StartsAt) })
	passkeys, err := h.store.ListPasskeys(ctx, userID)
	if err != nil {
		return models.MeResponse{}, err
	}
	return models.MeResponse{User: user, CompletedLabIDs: completed, Signups: signups, Passkeys: passkeys}, nil
}

func (h *Handler) respondMe(w http.ResponseWriter, r *http.Request, userID int64) {
	me, err := h.meBundle(r, userID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, me)
}

func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	id, ok := userauth.UserID(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Не авторизован")
		return
	}
	h.respondMe(w, r, id)
}

// updateProfile lets students set their own first and last name.
func (h *Handler) updateProfile(w http.ResponseWriter, r *http.Request) {
	id, _ := userauth.UserID(r.Context())
	var in models.ProfileInput
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := in.Validate(); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.store.SetDisplayName(r.Context(), id, in.DisplayName); err != nil {
		httpx.Fail(w, err)
		return
	}
	h.respondMe(w, r, id)
}

func (h *Handler) userLogout(w http.ResponseWriter, r *http.Request) {
	h.users.Clear(r.Context(), w, r)
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ---- Telegram ----

type telegramLoginRequest struct {
	userauth.TelegramData
	InviteCode string `json:"inviteCode"`
}

func (h *Handler) telegramLogin(w http.ResponseWriter, r *http.Request) {
	var in telegramLoginRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := userauth.VerifyTelegram(h.cfg.TelegramBotToken, in.TelegramData, time.Now(), 24*time.Hour); err != nil {
		switch {
		case errors.Is(err, userauth.ErrBadTelegramSignature):
			httpx.Error(w, http.StatusUnauthorized, "bad_signature", "Подпись Telegram не сошлась")
		case errors.Is(err, userauth.ErrTelegramExpired):
			httpx.Error(w, http.StatusUnauthorized, "expired", "Вход через Telegram устарел, попробуйте ещё раз")
		default:
			httpx.Error(w, http.StatusServiceUnavailable, "not_configured", "Вход через Telegram не настроен")
		}
		return
	}
	h.finishTelegram(w, r, in.TelegramData, in.InviteCode)
}

// finishTelegram opens or creates the account for verified Telegram data.
// New accounts wait for an admin to confirm them and get the group then;
// a correct invite code confirms right away, a wrong one is rejected so the
// student can retry instead of ending up with a pending account.
func (h *Handler) finishTelegram(w http.ResponseWriter, r *http.Request, d userauth.TelegramData, invite string) {
	ctx := r.Context()
	user, err := h.store.GetUserByTelegramID(ctx, d.ID)
	switch {
	case errors.Is(err, httpx.ErrNotFound):
		st, err := h.store.GetSettings(ctx)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		invite = strings.TrimSpace(invite)
		approved := st.InviteCode != "" && invite == st.InviteCode
		if invite != "" && !approved {
			httpx.Error(w, http.StatusForbidden, "invite_required", "Код доступа не подошёл")
			return
		}
		handle, err := randomHandle()
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		tgID := d.ID
		// The group is given on confirmation: right away with the invite code, else by the admin.
		group := ""
		if approved {
			group = st.DefaultApprovalGroup()
		}
		user, err = h.store.CreateUser(ctx, store.NewUser{
			WebauthnID: handle, Name: d.DisplayName(), TelegramID: &tgID, TelegramUsername: d.Username, PhotoURL: d.PhotoURL,
			GroupName: group, Approved: approved,
		})
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		h.admin.NewUser(user)
	case err != nil:
		httpx.Fail(w, err)
		return
	default:
		_ = h.store.TouchTelegramLogin(ctx, user.ID, d.DisplayName(), d.Username, d.PhotoURL)
	}
	if err := h.users.Issue(ctx, w, user.ID); err != nil {
		httpx.Fail(w, err)
		return
	}
	h.respondMe(w, r, user.ID)
}

// devLogin creates/opens a fake Telegram account by name. Only outside production.
func (h *Handler) devLogin(w http.ResponseWriter, r *http.Request) {
	if !h.cfg.DevLogin {
		httpx.Error(w, http.StatusNotFound, "not_found", "Маршрут не найден")
		return
	}
	var in struct {
		Name       string `json:"name"`
		InviteCode string `json:"inviteCode"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Fail(w, err)
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		httpx.Fail(w, &httpx.ValidationError{Fields: map[string]string{"name": "Укажите имя"}})
		return
	}
	hh := fnv.New64a()
	_, _ = hh.Write([]byte(strings.ToLower(in.Name)))
	fake := int64(hh.Sum64() % 1_000_000_000)
	parts := strings.Fields(in.Name)
	d := userauth.TelegramData{ID: fake, FirstName: parts[0], Username: "dev_" + strings.ToLower(parts[0]), AuthDate: time.Now().Unix()}
	if len(parts) > 1 {
		d.LastName = strings.Join(parts[1:], " ")
	}
	h.finishTelegram(w, r, d, in.InviteCode)
}

// ---- Passkeys ----

type passkeyBeginResponse struct {
	ChallengeID string `json:"challengeId"`
	Options     any    `json:"options"`
}

// passkeyRegisterBegin starts adding a passkey to the signed-in account.
// Accounts are created only through Telegram, so anonymous calls are rejected.
func (h *Handler) passkeyRegisterBegin(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id, ok := userauth.UserID(ctx)
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Сначала войдите через Telegram, затем добавьте пасскей в профиле")
		return
	}
	opts := []webauthn.RegistrationOption{
		webauthn.WithResidentKeyRequirement(protocol.ResidentKeyRequirementRequired),
		webauthn.WithAuthenticatorSelection(protocol.AuthenticatorSelection{
			ResidentKey:      protocol.ResidentKeyRequirementRequired,
			UserVerification: protocol.VerificationPreferred,
		}),
	}
	user, err := h.store.GetUser(ctx, id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	passkeys, err := h.store.ListPasskeys(ctx, id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	waUser := userauth.FromUser(user, passkeys)
	exclude := make([]protocol.CredentialDescriptor, 0, len(waUser.Credentials))
	for _, c := range waUser.Credentials {
		exclude = append(exclude, c.Descriptor())
	}
	opts = append(opts, webauthn.WithExclusions(exclude))
	cer := userauth.Ceremony{UserID: id}
	creation, sess, err := h.users.WebAuthn.BeginRegistration(waUser, opts...)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	cer.Session = *sess
	cid, err := h.users.SaveCeremony(ctx, cer)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, passkeyBeginResponse{ChallengeID: cid, Options: creation.Response})
}

type passkeyFinishRequest struct {
	ChallengeID string          `json:"challengeId"`
	Label       string          `json:"label"`
	Credential  json.RawMessage `json:"credential"`
}

func (h *Handler) passkeyRegisterFinish(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var in passkeyFinishRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Fail(w, err)
		return
	}
	cer, err := h.users.TakeCeremony(ctx, in.ChallengeID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "ceremony", "Попытка устарела, начните заново")
		return
	}
	parsed, err := protocol.ParseCredentialCreationResponseBody(bytes.NewReader(in.Credential))
	if err != nil {
		slog.Warn("passkey parse", "err", err)
		httpx.Error(w, http.StatusBadRequest, "bad_credential", "Не удалось прочитать ответ ключа")
		return
	}
	if cer.UserID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "ceremony", "Попытка устарела, начните заново")
		return
	}
	user, err := h.store.GetUser(ctx, cer.UserID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	passkeys, err := h.store.ListPasskeys(ctx, cer.UserID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	waUser := userauth.FromUser(user, passkeys)
	userID := user.ID
	cred, err := h.users.WebAuthn.CreateCredential(waUser, cer.Session, parsed)
	if err != nil {
		slog.Warn("passkey create", "err", err)
		httpx.Error(w, http.StatusBadRequest, "bad_credential", "Ключ не прошёл проверку")
		return
	}
	raw, err := json.Marshal(cred)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	label := strings.TrimSpace(in.Label)
	if label == "" {
		label = "Пасскей"
	}
	if err := h.store.CreatePasskey(ctx, userID, protocol.URLEncodedBase64(cred.ID).String(), label, raw); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.users.Issue(ctx, w, userID); err != nil {
		httpx.Fail(w, err)
		return
	}
	h.respondMe(w, r, userID)
}

func (h *Handler) passkeyLoginBegin(w http.ResponseWriter, r *http.Request) {
	assertion, sess, err := h.users.WebAuthn.BeginDiscoverableLogin(webauthn.WithUserVerification(protocol.VerificationPreferred))
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	cid, err := h.users.SaveCeremony(r.Context(), userauth.Ceremony{Session: *sess})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, passkeyBeginResponse{ChallengeID: cid, Options: assertion.Response})
}

func (h *Handler) passkeyLoginFinish(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var in passkeyFinishRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Fail(w, err)
		return
	}
	cer, err := h.users.TakeCeremony(ctx, in.ChallengeID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "ceremony", "Попытка устарела, начните заново")
		return
	}
	parsed, err := protocol.ParseCredentialRequestResponseBody(bytes.NewReader(in.Credential))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_credential", "Не удалось прочитать ответ ключа")
		return
	}
	var found models.User
	handler := func(_, userHandle []byte) (webauthn.User, error) {
		user, err := h.store.GetUserByWebauthnID(ctx, userHandle)
		if err != nil {
			return nil, err
		}
		passkeys, err := h.store.ListPasskeys(ctx, user.ID)
		if err != nil {
			return nil, err
		}
		found = user
		return userauth.FromUser(user, passkeys), nil
	}
	_, cred, err := h.users.WebAuthn.ValidatePasskeyLogin(handler, cer.Session, parsed)
	if err != nil {
		slog.Warn("passkey login", "err", err)
		httpx.Error(w, http.StatusUnauthorized, "bad_credential", "Ключ не подошёл")
		return
	}
	if raw, err := json.Marshal(cred); err == nil {
		_ = h.store.TouchPasskey(ctx, protocol.URLEncodedBase64(cred.ID).String(), raw)
	}
	_ = h.store.TouchLogin(ctx, found.ID)
	if err := h.users.Issue(ctx, w, found.ID); err != nil {
		httpx.Fail(w, err)
		return
	}
	h.respondMe(w, r, found.ID)
}

func (h *Handler) deletePasskey(w http.ResponseWriter, r *http.Request) {
	id, _ := userauth.UserID(r.Context())
	if err := h.store.DeletePasskey(r.Context(), id, chi.URLParam(r, "id")); err != nil {
		httpx.Fail(w, err)
		return
	}
	h.respondMe(w, r, id)
}

// ---- lab completion ----

func (h *Handler) setLabDone(done bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := userauth.UserID(r.Context())
		labID, err := httpx.IDParam(r)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		ok, err := h.store.LabExists(r.Context(), labID)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		if !ok {
			httpx.Fail(w, httpx.ErrNotFound)
			return
		}
		if err := h.store.SetLabCompletion(r.Context(), userID, labID, done); err != nil {
			httpx.Fail(w, err)
			return
		}
		ids, err := h.store.ListCompletedLabIDs(r.Context(), userID)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"completedLabIds": ids})
	}
}

// ---- practice sessions ----

// freezeQueues stores the order of sessions past their freeze time. A failure
// (say, two readers racing) only postpones it to the next read, so it is logged.
func (h *Handler) freezeQueues(ctx context.Context, loc *time.Location) {
	if err := h.store.FreezeQueues(ctx, loc); err != nil {
		slog.Warn("practice queues not frozen", "err", err)
	}
}

func queueEntry(r store.QueuedSignup, capacity *int, i int) models.QueueEntry {
	return models.QueueEntry{
		User:    models.PublicUser{ID: r.UserID, Name: r.UserName, PhotoURL: r.PhotoURL, Group: r.UserGroup},
		Lab:     models.LabRef{ID: r.LabID, Number: r.LabNumber, Title: r.LabTitle, Slug: r.LabSlug, SubjectSlug: r.SubjectSlug},
		Reserve: capacity != nil && i >= *capacity,
		Carried: r.Missed > 0,
		Missed:  r.Missed,
		Late:    r.Late,
	}
}

func (h *Handler) practiceViews(r *http.Request, sessions []models.PracticeSession, sc siteContext) ([]models.PracticeSessionView, error) {
	ctx := r.Context()
	userID, signedIn := userauth.UserID(ctx)
	queues, err := h.store.Queues(ctx, sessions, sc.Loc)
	if err != nil {
		return nil, err
	}
	labsBySubject := map[int64][]models.LabRef{}
	views := make([]models.PracticeSessionView, 0, len(sessions))
	for _, s := range sessions {
		v := models.PracticeSessionView{PracticeSession: s, Queue: []models.QueueEntry{}, Participants: []models.Participant{}, MyLabIDs: []int64{}, AvailableLabs: []models.LabRef{}}
		v.Past = s.StartsAt.Before(sc.Now)
		if s.EndsAt != nil {
			v.Past = s.EndsAt.Before(sc.Now)
		}
		v.FreezesAt = queue.FreezeAt(s.StartsAt, sc.Loc)
		v.Frozen = !v.FreezesAt.After(sc.Now)
		byUser := map[int64]int{}
		for i, row := range queues[s.ID] {
			e := queueEntry(row, s.Capacity, i)
			v.Queue = append(v.Queue, e)
			idx, ok := byUser[row.UserID]
			if !ok {
				v.Participants = append(v.Participants, models.Participant{User: e.User, Labs: []models.LabRef{}})
				idx = len(v.Participants) - 1
				byUser[row.UserID] = idx
			}
			v.Participants[idx].Labs = append(v.Participants[idx].Labs, e.Lab)
			if signedIn && row.UserID == userID {
				v.MyLabIDs = append(v.MyLabIDs, row.LabID)
			}
		}
		if signedIn {
			labs, ok := labsBySubject[s.SubjectID]
			if !ok {
				labs, err = h.store.ListSubjectLabRefs(ctx, s.SubjectID)
				if err != nil {
					return nil, err
				}
				labsBySubject[s.SubjectID] = labs
			}
			v.AvailableLabs = labs
		}
		v.Full = s.Capacity != nil && len(v.Queue) >= *s.Capacity
		views = append(views, v)
	}
	return views, nil
}

func (h *Handler) listPractice(w http.ResponseWriter, r *http.Request) {
	sc, err := h.site(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	h.freezeQueues(r.Context(), sc.Loc)
	f := store.PracticeFilter{SubjectSlug: r.URL.Query().Get("subject")}
	if r.URL.Query().Get("past") == "" {
		from := sc.Now
		f.From = &from
	}
	sessions, err := h.store.ListPracticeSessions(r.Context(), f)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	views, err := h.practiceViews(r, sessions, sc)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	_, signedIn := userauth.UserID(r.Context())
	httpx.JSON(w, http.StatusOK, map[string]any{"sessions": views, "now": sc.Now, "signedIn": signedIn})
}

func (h *Handler) getPractice(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.IDParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	h.respondPractice(w, r, id)
}

func (h *Handler) respondPractice(w http.ResponseWriter, r *http.Request, id int64) {
	sc, err := h.site(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	h.freezeQueues(r.Context(), sc.Loc)
	sess, err := h.store.GetPracticeSession(r.Context(), id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	views, err := h.practiceViews(r, []models.PracticeSession{sess}, sc)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, views[0])
}

func (h *Handler) setPracticeSignup(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID, _ := userauth.UserID(ctx)
	id, err := httpx.IDParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	var in struct {
		LabIDs []int64 `json:"labIds"`
	}
	if r.Method != http.MethodDelete {
		if err := httpx.Decode(r, &in); err != nil {
			httpx.Fail(w, err)
			return
		}
	}
	sess, err := h.store.GetPracticeSession(ctx, id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	end := sess.StartsAt
	if sess.EndsAt != nil {
		end = *sess.EndsAt
	}
	if end.Before(time.Now()) {
		httpx.Fail(w, &httpx.ValidationError{Fields: map[string]string{"_": "Эта сдача уже прошла"}})
		return
	}
	// Заморозить до записи: запись после 20:00 накануне должна встать в конец.
	if sc, err := h.site(ctx); err == nil {
		h.freezeQueues(ctx, sc.Loc)
	}
	if err := h.store.ReplaceSignups(ctx, id, userID, in.LabIDs); err != nil {
		httpx.Fail(w, err)
		return
	}
	h.respondPractice(w, r, id)
}

// ---- admin ----

func (h *Handler) adminListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.store.ListUsers(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, users)
}

// adminUpdateUser sets the display name and group and confirms or revokes the account.
func (h *Handler) adminUpdateUser(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.IDParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	var in models.AdminUserInput
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := in.Validate(); err != nil {
		httpx.Fail(w, err)
		return
	}
	user, err := h.store.UpdateUserProfile(r.Context(), id, in)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, user)
}

func (h *Handler) adminDeleteUser(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.IDParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.store.DeleteUser(r.Context(), id); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) adminPracticeSignups(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.IDParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	h.writeAdminSignups(w, r, id)
}

// adminReorderSignups sets the order in which students hand their labs in.
func (h *Handler) adminReorderSignups(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.IDParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	var in models.SignupOrderInput
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := in.Validate(); err != nil {
		httpx.Fail(w, err)
		return
	}
	keys := make([]queue.Key, len(in.Entries))
	for i, e := range in.Entries {
		keys[i] = queue.Key{UserID: e.UserID, LabID: e.LabID}
	}
	if err := h.store.ReorderSignups(r.Context(), id, keys); err != nil {
		httpx.Fail(w, err)
		return
	}
	h.writeAdminSignups(w, r, id)
}

// adminAutoQueue drops the manual order and lets the server order the queue again.
func (h *Handler) adminAutoQueue(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.IDParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.store.AutoQueue(r.Context(), id); err != nil {
		httpx.Fail(w, err)
		return
	}
	h.writeAdminSignups(w, r, id)
}

func (h *Handler) writeAdminSignups(w http.ResponseWriter, r *http.Request, id int64) {
	sc, err := h.site(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	h.freezeQueues(r.Context(), sc.Loc)
	sess, err := h.store.GetPracticeSession(r.Context(), id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	queues, err := h.store.Queues(r.Context(), []models.PracticeSession{sess}, sc.Loc)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	entries := make([]models.QueueEntry, 0, len(queues[id]))
	for i, row := range queues[id] {
		entries = append(entries, queueEntry(row, sess.Capacity, i))
	}
	freezesAt := queue.FreezeAt(sess.StartsAt, sc.Loc)
	httpx.JSON(w, http.StatusOK, map[string]any{
		"session":     sess,
		"queue":       entries,
		"queueManual": sess.QueueManual,
		"freezesAt":   freezesAt,
		"frozen":      !freezesAt.After(sc.Now),
	})
}
