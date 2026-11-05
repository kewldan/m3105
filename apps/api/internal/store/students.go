package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/kewldan/edu3105/apps/api/internal/httpx"
	"github.com/kewldan/edu3105/apps/api/internal/models"
)

// ListStudents returns the course list with the account that picked each row (admin).
func (s *Store) ListStudents(ctx context.Context) ([]models.Student, error) {
	return many[models.Student](ctx, s.db, `SELECT st.id, st.isu, st.full_name, st.group_name, st.stream, st.created_at,
		u.id AS user_id, `+userNameExpr+` AS user_name
		FROM students st LEFT JOIN users u ON u.isu = st.isu
		ORDER BY st.group_name, st.full_name`)
}

// ListFreeStudents returns rows no other account has picked yet.
func (s *Store) ListFreeStudents(ctx context.Context, userID int64) ([]models.StudentChoice, error) {
	return many[models.StudentChoice](ctx, s.db, `SELECT st.id, st.full_name, st.group_name FROM students st
		WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.isu = st.isu AND u.id <> $1)
		ORDER BY st.group_name, st.full_name`, userID)
}

// syncPicked copies names and groups from the list onto the accounts that picked them.
const syncPicked = `UPDATE users u SET display_name = split_part(st.full_name, ' ', 2) || ' ' || split_part(st.full_name, ' ', 1),
	group_name = st.group_name FROM students st WHERE u.isu = st.isu`

// ImportStudents adds new rows and updates the names and groups of known numbers.
// Accounts with a number from the list get its name and group.
func (s *Store) ImportStudents(ctx context.Context, rows []models.StudentInput) (added, updated int, err error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return 0, 0, wrap(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	for _, r := range rows {
		var inserted bool
		err := tx.QueryRow(ctx, `INSERT INTO students (isu, full_name, group_name, stream) VALUES ($1, $2, $3, $4)
			ON CONFLICT (isu) DO UPDATE SET full_name = EXCLUDED.full_name, group_name = EXCLUDED.group_name,
				stream = CASE WHEN EXCLUDED.stream > 0 THEN EXCLUDED.stream ELSE students.stream END, updated_at = now()
			WHERE (students.full_name, students.group_name) IS DISTINCT FROM (EXCLUDED.full_name, EXCLUDED.group_name)
				OR (EXCLUDED.stream > 0 AND EXCLUDED.stream <> students.stream)
			RETURNING (xmax = 0)`, r.ISU, r.FullName, r.GroupName, r.Stream).Scan(&inserted)
		switch {
		case errors.Is(err, pgx.ErrNoRows): // unchanged
		case err != nil:
			return 0, 0, wrap(err)
		case inserted:
			added++
		default:
			updated++
		}
	}
	// New rows too: an account may already have the number (linked by grades
	// or by the admin) and gets its name and group from the list on import.
	if added+updated > 0 {
		if _, err := tx.Exec(ctx, syncPicked); err != nil {
			return 0, 0, wrap(err)
		}
	}
	return added, updated, wrap(tx.Commit(ctx))
}

// ListStudyGroups returns the groups of the course list with their streams.
func (s *Store) ListStudyGroups(ctx context.Context) ([]models.StudyGroup, error) {
	return many[models.StudyGroup](ctx, s.db, `SELECT group_name AS name, max(stream) AS stream, count(*)::int AS students
		FROM students GROUP BY group_name ORDER BY max(stream), group_name`)
}

// CountStudents returns the size of the list.
func (s *Store) CountStudents(ctx context.Context) (int, error) {
	var n int
	err := s.db.QueryRow(ctx, `SELECT count(*) FROM students`).Scan(&n)
	return n, wrap(err)
}

// DeleteStudent removes a row. An account that picked it keeps its name and
// confirmation; it is the admin's call to unlink it as well.
func (s *Store) DeleteStudent(ctx context.Context, id int64) error {
	return s.exec(ctx, `DELETE FROM students WHERE id = $1`, id)
}

// ErrAlreadyClaimed means the account is confirmed already, ErrStudentTaken —
// another account picked the row first.
var (
	ErrAlreadyClaimed = errors.New("already claimed")
	ErrStudentTaken   = errors.New("student taken")
)

// ClaimStudent confirms the account as the student from the list: it gets the
// ISU number, "Имя Фамилия" and the group, and cannot pick anyone else later.
func (s *Store) ClaimStudent(ctx context.Context, userID, studentID int64) (models.User, models.Student, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return models.User{}, models.Student{}, wrap(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var approved bool
	if err := tx.QueryRow(ctx, `SELECT approved_at IS NOT NULL FROM users WHERE id = $1 FOR UPDATE`, userID).Scan(&approved); err != nil {
		return models.User{}, models.Student{}, wrap(err)
	}
	if approved {
		return models.User{}, models.Student{}, ErrAlreadyClaimed
	}
	st, err := one[models.Student](ctx, tx, `SELECT id, isu, full_name, group_name, stream, created_at FROM students WHERE id = $1`, studentID)
	if err != nil {
		return models.User{}, models.Student{}, err
	}
	_, err = tx.Exec(ctx, `UPDATE users SET isu = $2, display_name = $3, group_name = $4, approved_at = now() WHERE id = $1`,
		userID, st.ISU, models.FirstLast(st.FullName), st.GroupName)
	if errors.Is(wrap(err), httpx.ErrConflict) {
		return models.User{}, models.Student{}, ErrStudentTaken
	}
	if err != nil {
		return models.User{}, models.Student{}, wrap(err)
	}
	if err := tx.Commit(ctx); err != nil {
		return models.User{}, models.Student{}, wrap(err)
	}
	user, err := s.GetUser(ctx, userID)
	return user, st, err
}

// UnclaimUser takes the confirmation back: the account forgets the student it
// picked and has to pick again. ok is false when there was nothing to undo.
func (s *Store) UnclaimUser(ctx context.Context, id int64) (user models.User, ok bool, err error) {
	tag, err := s.db.Exec(ctx, `UPDATE users SET isu = NULL, display_name = '', group_name = '', approved_at = NULL
		WHERE id = $1 AND (approved_at IS NOT NULL OR COALESCE(isu, '') <> '')`, id)
	if err != nil {
		return models.User{}, false, wrap(err)
	}
	user, err = s.GetUser(ctx, id)
	return user, tag.RowsAffected() > 0, err
}
