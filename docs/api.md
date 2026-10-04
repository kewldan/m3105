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
| GET | `/files/{id}/{name}` | файл вложения (см. «Вложения»); `?download=1` — скачать вместо просмотра |

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
| PUT | `/me/profile` | `{ displayName }` — имя и фамилия (минимум два слова; пустая строка — снова имя из Telegram) |
| DELETE | `/me/passkeys/{id}` | |
| GET | `/practice?subject=&past=1` | `{ sessions, now, signedIn }`; очередь (`queue`) видна всем, `availableLabs` — только вошедшим |
| GET | `/practice/{id}` | одна сдача |
| PUT | `/practice/{id}/signups` | `{ labIds }` — записаться с выбранными лабами (пустой список = отменить); лимита нет, сверх `capacity` — резерв |
| DELETE | `/practice/{id}/signups` | отменить запись |
| GET | `/comments/{target}/{id}` | комментарии к `note`, `lab` или `post` (публично); `mine` для своих |
| POST | `/comments/{target}/{id}` | `{ body, attachmentIds? }` — до 2000 символов; конспект или лаба должны быть опубликованы; с файлами текст можно не писать |
| DELETE | `/comments/{id}` | только свой комментарий, иначе 403 |
| GET | `/posts?kind=shawarma\|joke&sort=new\|top` | лента постов — только подтверждённым студентам группы сайта (`settings.groupName`): без входа 401, остальным 403 `not_member`; так же закрыты все `/posts/*`, комментарии к постам и файлы постов (чужим 404) |
| POST | `/posts` | `{ kind, title, body, address, price, rating, attachmentIds? }` — для `shawarma` нужны название точки и оценка 1–5, у `joke` только текст |
| PUT / DELETE | `/posts/{id}` | свой пост; `kind` не меняется; `attachmentIds` — итоговый список файлов по порядку, без поля файлы не трогаются |
| POST | `/files` | `multipart/form-data` с полем `file` — фото или PDF для будущего комментария или поста, ответ `Attachment` |
| PUT / DELETE | `/posts/{id}/like` | поставить или снять лайк, ответ — обновлённый пост |

Антиспам: один аккаунт может создать не больше 10 комментариев и постов за 12 часов, дальше 429 `rate_limited` (константы `socialWriteLimit` и `socialWriteWindow` в `api/social.go`).

Админка: `GET /admin/users`, `PUT /admin/users/{id}` (`{ displayName, groupName, approved }` — имя и фамилия, группа, подтверждение), `DELETE /admin/users/{id}`, CRUD `/admin/practice`
(сдачи: предмет, дата, аудитория, сколько защит примут за пару, заметка), `GET /admin/practice/{id}/signups`
(`{ session, queue, queueManual, freezesAt, frozen }`), `PUT /admin/practice/{id}/signups/order`
(`{ entries: [{ userId, labId }] }` — ручной порядок всех защит, дальше новые записи встают в конец),
`POST /admin/practice/{id}/signups/auto` (вернуть порядок по правилам).

Очередь сдачи (`internal/queue`, `store/practice_queue.go`) состоит из защит — студент с одной лабой:

1. Первыми идут защиты, оставшиеся в резерве предыдущей сдачи того же предмета (места сверх `capacity`
   в её сохранённом порядке). Кто оставался в резерве несколько сдач подряд (`missed`), идёт раньше
   тех, кто один раз; при равенстве — в порядке прошлого резерва. Цепочка считается назад по сдачам
   предмета, пока защита была в их резерве.
2. Дальше по кругам: у каждого студента сначала его самая новая лаба, вторая — после первых лаб всех.
   Внутри круга новее лаба раньше, при равенстве — жребий, закреплённый за парой (сдача, студент).
   Время записи на место не влияет.
3. В 20:00 накануне (`queue.FreezeAt`, таймзона из настроек) порядок замораживается: при первом чтении
   или записи после этого момента он пишется в `queue_pos` (`queue_frozen_at`). Поздние записи получают
   следующий номер из последовательности и встают в конец по времени записи; отмена только сдвигает
   остальных. До заморозки порядок считается на лету и в базу не пишется.
4. Ручная перестановка в админке (`queue_manual`) тоже сохраняет порядок, дальше только дописываем.

Модерация: `GET /admin/comments` (последние 200 с `targetTitle` и `targetPath`), `PUT /admin/comments/{id}`
(`{ body, attachmentIds? }` — текст и файлы любого комментария), `DELETE /admin/comments/{id}`,
`GET /admin/posts?kind=`, `PUT /admin/posts/{id}`, `DELETE /admin/posts/{id}` — админ правит и удаляет любые посты и комментарии.

## Вложения

Файлы лежат в S3-совместимом хранилище (MinIO в `docker-compose.yml`, в `devapi` — каталог рядом
с данными Postgres), описание — в таблице `attachments`. Отдаёт файлы сам API по адресу из поля
`url` (`/api/v1/files/{id}/{транслит имени}`), поэтому бакет приватный и работают права.

- Загрузка — `multipart/form-data` с полем `file`, ответ — `Attachment` `{ id, url, name, contentType, size, width, height, createdAt }`.
  Студент (`POST /files`, подтверждённый аккаунт): JPG, PNG, GIF, WebP и PDF до 10 МБ, не больше 30 файлов
  за 12 часов (429 `rate_limited`). Админка (`POST /admin/files`): любые файлы до 50 МБ; тот же файл
  повторно не сохраняется — возвращается уже загруженный (200 вместо 201).
- Тип определяется по содержимому, имя и `Content-Type` браузера не учитываются. У JPEG, PNG и WebP
  вырезаются EXIF, XMP и текстовые блоки (там бывают координаты), ориентация фото сохраняется;
  `width`/`height` — уже с учётом поворота. Картинки больше 60 мегапикселей отклоняются.
- Прикрепление: `attachmentIds` в комментарии или посте — только свои файлы, ещё ни к чему не прикреплённые
  (иначе 422 по полю `attachmentIds`), не больше 6. Файлы удаляются вместе с комментарием, постом или
  аккаунтом; загруженные, но так и не прикреплённые — через сутки. Объекты без строки в базе раз в час
  подчищает сборщик мусора (`files.RunGC`).
- Доступ: незаконченную загрузку видит только автор; файлы поста `members` и комментариев к нему —
  только вошедшие студенты; остальное публично. Недоступное отвечает 404. Картинки, PDF, видео и аудио
  открываются в браузере, прочее отдаётся как вложение; у всего, кроме PDF, заголовок
  `Content-Security-Policy: … sandbox`, так что SVG или HTML не выполнят скрипт на домене сайта.
  Публичные файлы кешируются навсегда (`immutable`: по id содержимое не меняется).
- Превью: `?w=160|320|640|1280|1920` у JPEG, PNG и WebP — уменьшенная копия от imgproxy (WebP, если он есть
  в `Accept`; `Vary: Accept`). Права проверяются до imgproxy, он сам наружу не открыт. Картинка уже нужной
  ширины, GIF, SVG, `?download=1`, недоступный imgproxy — всё это отдаёт оригинал.
- Админка: `GET /admin/files` — последние 500 файлов с `place` (`content` — для текстов,
  `comment`, `post`, `pending`), автором, ссылкой на комментарий или пост и `usedIn` — где на файл
  ссылаются тексты конспектов, лаб, страниц, ЧаВо и предметов; `DELETE /admin/files/{id}` удаляет любой файл.
  `POST /admin/files?scope=social` грузит файл для чужого поста или комментария: его можно передать в
  `attachmentIds` в `PUT /admin/posts/{id}` и `PUT /admin/comments/{id}`, в тексты он не попадает и повторно
  не переиспользуется. Админ (кука или Bearer) видит любые файлы, включая посты `members` и незаконченные загрузки.
- Без `S3_ENDPOINT` и `FILES_DIR` загрузка отвечает 503 `files_disabled`.

`GET /admin/search-queries?days=30&limit=50` — аналитика поиска: что искали, сколько раз и сколько раз
не нашли ничего. Промежуточные запросы «по мере набора» отфильтрованы, хранится только сам текст запроса.
При удалении конспекта, лабы или поста их комментарии удаляются вместе с ними.
Сдачи и события попадают в календарь и ICS вместе с дедлайнами лаб (поле `source`: `lab`, `event`, `practice`), а ещё показываются на главной в блоке «События» и на странице «Сдачи».
