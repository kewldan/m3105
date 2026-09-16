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
| GET | `/search?q=&limit=` | полнотекстовый поиск по опубликованному: словоформы, префикс последнего слова, опечатки через триграммы; результаты по релевантности, в `snippet` фрагмент с `<mark>` |

## Авторизация

`POST /auth/login` с `{ "password": "…" }` ставит HttpOnly-куку `edu_session`
(сессия в Valkey, 30 дней). `POST /auth/logout`, `GET /auth/me`. Десять попыток
входа за 15 минут с одного IP (считаются все, не только неверные) блокируют вход
на это окно.

Если задан `ADMIN_API_TOKEN`, админские эндпоинты принимают также заголовок
`Authorization: Bearer <token>` — без входа и сессии, для скриптов
(`scripts/content.ts`). `GET /auth/me` с токеном тоже отвечает 200.

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
пасскей (WebAuthn) добавляется в профиле и затем работает как второй способ входа.
Новый аккаунт получает `groupName` из настроек и ждёт подтверждения администратором (`approved: false`):
профиль и чтение доступны, а запись на сдачи, отметки лаб, комментарии, посты и лайки отвечают 403 `not_approved`.
Если в настройках задан код доступа и он передан в `inviteCode`, аккаунт подтверждается сразу; неверный код — 403 `invite_required`.
Имя (`name`) — это `displayName`, выставленное админом, иначе `telegramName`, который обновляется при каждом входе через Telegram.
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
| PUT / DELETE | `/me/labs/{labId}/done` | отметить лабу сделанной / снять отметку |
| DELETE | `/me/passkeys/{id}` | |
| GET | `/practice?subject=&past=1` | `{ sessions, now, signedIn }`; участники и `availableLabs` только для вошедших |
| GET | `/practice/{id}` | одна сдача |
| PUT | `/practice/{id}/signups` | `{ labIds }` — записаться с выбранными лабами (пустой список = отменить); 409 `full`, если мест нет |
| DELETE | `/practice/{id}/signups` | отменить запись |
| GET | `/comments/{target}/{id}` | комментарии к `note`, `lab` или `post` (публично); `mine` для своих |
| POST | `/comments/{target}/{id}` | `{ body }` — до 2000 символов; конспект или лаба должны быть опубликованы |
| DELETE | `/comments/{id}` | только свой комментарий, иначе 403 |
| GET | `/posts?kind=shawarma\|joke&sort=new\|top` | лента постов (публично); `liked` и `mine` для вошедших. Без куки отдаются только `visibility: public` |
| POST | `/posts` | `{ kind, title, body, address, price, rating, visibility, nsfw }` — для `shawarma` нужны название точки и оценка 1–5, у `joke` только текст. `visibility: members` прячет пост от невошедших, `nsfw: true` ставит пометку 18+ и принудительно делает пост `members` |
| PUT / DELETE | `/posts/{id}` | свой пост; `kind` не меняется |
| PUT / DELETE | `/posts/{id}/like` | поставить или снять лайк, ответ — обновлённый пост |

Антиспам: один аккаунт может создать не больше 10 комментариев и постов за 12 часов, дальше 429 `rate_limited` (константы `socialWriteLimit` и `socialWriteWindow` в `api/social.go`).

Админка: `GET /admin/users`, `PUT /admin/users/{id}` (`{ displayName, groupName, approved }` — имя и фамилия, группа, подтверждение), `DELETE /admin/users/{id}`, CRUD `/admin/practice`
(сдачи: предмет, дата, аудитория, вместимость, заметка), `GET /admin/practice/{id}/signups`.
Модерация: `GET /admin/comments` (последние 200 с `targetTitle` и `targetPath`), `DELETE /admin/comments/{id}`,
`GET /admin/posts?kind=`, `PUT /admin/posts/{id}`, `DELETE /admin/posts/{id}` — админ правит и удаляет любые посты и комментарии.
При удалении конспекта, лабы или поста их комментарии удаляются вместе с ними.
Сдачи и события попадают в календарь и ICS вместе с дедлайнами лаб (поле `source`: `lab`, `event`, `practice`), а ещё показываются на главной в блоке «События» и на странице «Сдачи».
