package api

import (
	"errors"
	"net/http"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
	"github.com/kewldan/edu3105/apps/api/internal/store"
	"github.com/kewldan/edu3105/apps/api/internal/students"
	"github.com/kewldan/edu3105/apps/api/internal/userauth"
)

// freeStudents lists the course rows a new account can pick: everyone no other
// account has picked. Confirmed accounts get an empty list, they are done.
func (h *Handler) freeStudents(w http.ResponseWriter, r *http.Request) {
	id, _ := userauth.UserID(r.Context())
	user, err := h.store.GetUser(r.Context(), id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if user.Approved {
		httpx.JSON(w, http.StatusOK, []models.StudentChoice{})
		return
	}
	list, err := h.store.ListFreeStudents(r.Context(), id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

// claimStudent confirms the account as the picked student. The choice is final:
// name, group and ISU number come from the list and only an admin can undo it.
func (h *Handler) claimStudent(w http.ResponseWriter, r *http.Request) {
	id, _ := userauth.UserID(r.Context())
	var in models.ClaimInput
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Fail(w, err)
		return
	}
	user, st, err := h.store.ClaimStudent(r.Context(), id, in.StudentID)
	switch {
	case errors.Is(err, store.ErrAlreadyClaimed):
		httpx.Error(w, http.StatusConflict, "already_claimed", "Вы уже выбрали себя в списке. Ошиблись — напишите администратору")
		return
	case errors.Is(err, store.ErrStudentTaken):
		httpx.Error(w, http.StatusConflict, "student_taken", "Этого студента уже выбрал другой аккаунт. Если это вы — напишите администратору")
		return
	case errors.Is(err, httpx.ErrNotFound):
		httpx.Error(w, http.StatusNotFound, "not_found", "Такого студента нет в списке, обновите страницу")
		return
	case err != nil:
		httpx.Fail(w, err)
		return
	}
	h.admin.Claimed(user, st)
	h.respondMe(w, r, id)
}

// adminStudyGroups lists groups and streams for the audience picker.
func (h *Handler) adminStudyGroups(w http.ResponseWriter, r *http.Request) {
	list, err := h.store.ListStudyGroups(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

func (h *Handler) adminListStudents(w http.ResponseWriter, r *http.Request) {
	list, err := h.store.ListStudents(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

// adminImportStudents adds and updates rows from a pasted table or a saved page.
func (h *Handler) adminImportStudents(w http.ResponseWriter, r *http.Request) {
	var in models.StudentImport
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Fail(w, err)
		return
	}
	rows, skipped := students.Parse(in.Text)
	if len(rows) == 0 {
		httpx.Fail(w, &httpx.ValidationError{Fields: map[string]string{"text": "Не нашли ни одной строки с номером ИСУ, ФИО и группой"}})
		return
	}
	added, updated, err := h.store.ImportStudents(r.Context(), rows)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	total, err := h.store.CountStudents(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, models.StudentImportResult{Added: added, Updated: updated, Skipped: skipped, Total: total})
}

// adminCreateStudent adds one person by hand, e.g. someone missing from the lists.
func (h *Handler) adminCreateStudent(w http.ResponseWriter, r *http.Request) {
	var in models.StudentInput
	if err := httpx.Decode(r, &in); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := in.Validate(); err != nil {
		httpx.Fail(w, err)
		return
	}
	if _, _, err := h.store.ImportStudents(r.Context(), []models.StudentInput{in}); err != nil {
		httpx.Fail(w, err)
		return
	}
	h.adminListStudents(w, r)
}

func (h *Handler) adminDeleteStudent(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.IDParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.store.DeleteStudent(r.Context(), id); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// adminUnclaimUser unlinks the account from the student it picked; it has to pick again.
func (h *Handler) adminUnclaimUser(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.IDParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	user, _, err := h.store.UnclaimUser(r.Context(), id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, user)
}
