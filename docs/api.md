# API

Публичная часть описана в OpenAPI 3.1: спека `apps/api/internal/api/openapi.yaml`,
на сервере отдаётся как `GET /api/v1/openapi.yaml`, интерактивная документация — `/api/v1/docs`
(например, https://m3105.ru/api/v1/docs).

Бэкенд: Go, префикс `/api/v1`. Все ответы JSON, время в RFC 3339 (UTC), даты
без времени — `YYYY-MM-DD`. Ошибки:

```json
{ "error": "Проверьте заполнение полей", "code": "validation", "fields": { "title": "Укажите название" } }
```

Коды: `validation` (422), `not_found` (404), `conflict` (409), `unauthorized` (401),
`bad_password` (401), `rate_limited` (429), `internal` (500).

## Публичные

| Метод | Путь | Что возвращает |
| ----- | ---- | -------------- |
| GET | `/settings` | `{ settings, week, now, navPages }` |
| GET | `/home` | сводка для главной: ближайшие дедлайны лаб (`upcomingDeadlines`), просроченные, события и сдачи (`upcomingEvents`), свежие конспекты, предметы |
| GET | `/subjects` | предметы со счётчиками опубликованного |
| GET | `/subjects/{slug}` | `{ subject, labs, notes, quizzes }` |
| GET | `/labs?subject=` | опубликованные лабы (без длинных текстов) |
| GET | `/labs/{subject}/{slug}` | лаба целиком |
| GET | `/calendar?from=&to=&subject=` | `{ items, from, to, now }` — только дедлайны лаб |
| GET | `/calendar.ics?subject=` | iCalendar-фид дедлайнов лаб с напоминаниями за сутки |
| GET | `/faq` | список вопросов |
| GET | `/pages`, `/pages/{slug}` | статические страницы |
| GET | `/notes?subject=`, `/notes/{subject}/{slug}` | конспекты; страница отдаёт ещё `quizzes`, `prev`, `next` |
| GET | `/quizzes?subject=`, `/quizzes/{slug}` | квизы |
| GET | `/search?q=` | поиск по опубликованному |

## Авторизация

`POST /auth/login` с `{ "password": "…" }` ставит HttpOnly-куку `edu_session`
(сессия в Valkey, 30 дней). `POST /auth/logout`, `GET /auth/me`. Десять неверных
попыток за 15 минут с одного IP блокируют вход на это окно.

## Админка (`/admin/*`, требует куку)

`GET/PUT /admin/settings`, `GET /admin/overview` и стандартный CRUD для
`subjects`, `labs`, `events`, `faq`, `pages`, `notes`, `quizzes`:
`GET /`, `POST /`, `GET /{id}`, `PUT /{id}`, `DELETE /{id}`.
Квиз обязательно привязан к конспекту (`noteId`), предмет берётся из него; на сайте квизы показываются под конспектом. `POST /admin/quizzes/validate` проверяет массив вопросов и возвращает
нормализованный вариант. Слаги генерируются из названия транслитерацией и
дедуплицируются автоматически.

Формы ввода описаны в `apps/web/lib/api/types.ts` (`*Input`) и в
`apps/api/internal/models/models.go`.

## Аккаунты студентов

Без паролей: аккаунт создаётся при первом входе через Telegram Login Widget;
пасскей (WebAuthn) добавляется в профиле и затем работает как второй способ входа. Если в настройках задан код доступа,
первый вход требует его (`inviteCode` в теле запроса, иначе 403 `invite_required`).
Сессия — HttpOnly-кука `edu_user`, 30 дней в Valkey.

| Метод | Путь | Описание |
| ----- | ---- | -------- |
| POST | `/auth/telegram` | тело — объект виджета (`id, first_name, last_name, username, photo_url, auth_date, hash`) + `inviteCode`; подпись проверяется HMAC-SHA256 по токену бота |
| POST | `/auth/dev-login` | только вне production: `{ name, inviteCode }` |
| POST | `/auth/passkey/register/begin` | только с сессией студента: добавляет пасскей к аккаунту; ответ `{ challengeId, options }` |
| POST | `/auth/passkey/register/finish` | `{ challengeId, label?, credential }` |
| POST | `/auth/passkey/login/begin` | `{ challengeId, options }` для discoverable-входа |
| POST | `/auth/passkey/login/finish` | `{ challengeId, credential }` |
| GET | `/auth/user/me` | `{ user, completedLabIds, signups, passkeys }` |
| POST | `/auth/user/logout` | |
| PUT | `/me/` | `{ name }` |
| PUT / DELETE | `/me/labs/{labId}/done` | отметить лабу сделанной / снять отметку |
| DELETE | `/me/passkeys/{id}` | |
| GET | `/practice?subject=&past=1` | `{ sessions, now, signedIn }`; участники и `availableLabs` только для вошедших |
| GET | `/practice/{id}` | одна сдача |
| PUT | `/practice/{id}/signups` | `{ labIds }` — записаться с выбранными лабами (пустой список = отменить); 409 `full`, если мест нет |
| DELETE | `/practice/{id}/signups` | отменить запись |

Админка: `GET /admin/users`, `DELETE /admin/users/{id}`, CRUD `/admin/practice`
(сдачи: предмет, дата, аудитория, вместимость, заметка), `GET /admin/practice/{id}/signups`.
Сдачи и события попадают в календарь и ICS вместе с дедлайнами лаб (поле `source`: `lab`, `event`, `practice`), а ещё показываются на главной в блоке «События» и на странице «Сдачи».
