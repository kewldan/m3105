#!/bin/sh
# Ежедневный бэкап edu3105: дамп базы и конфиги сервера одним архивом в Telegram.
# Режимы: `loop` (по расписанию, так запускается контейнер) и `once` (один раз, вручную).
set -eu

BACKUP_DIR=${BACKUP_DIR:-/backups}
PROJECT_DIR=${PROJECT_DIR:-/project}
BACKUP_HOUR=${BACKUP_HOUR:-4}
BACKUP_KEEP=${BACKUP_KEEP:-7}
CHAT_ID=${BACKUP_CHAT_ID:-}
TOKEN=${TELEGRAM_BOT_TOKEN:-}
# Telegram принимает от бота документы до 50 МБ; оставляем запас.
MAX_BYTES=${BACKUP_MAX_BYTES:-47000000}

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') backup: $*"; }

# strip0 убирает ведущий ноль: в ash "08" в арифметике — ошибка восьмеричного числа.
strip0() { v=${1#0}; echo "${v:-0}"; }

tg_ready() { [ -n "$TOKEN" ] && [ -n "$CHAT_ID" ]; }

tg_text() {
	if ! tg_ready; then
		log "Telegram не настроен (TELEGRAM_BOT_TOKEN/BACKUP_CHAT_ID), сообщение не отправлено"
		return 0
	fi
	curl -sS -m 60 -X POST "https://api.telegram.org/bot$TOKEN/sendMessage" \
		--form-string "chat_id=$CHAT_ID" --form-string "parse_mode=HTML" --form-string "text=$1" >/dev/null 2>&1 ||
		log "не удалось отправить сообщение в Telegram"
}

tg_doc() {
	if ! tg_ready; then
		log "Telegram не настроен, архив остался только в $BACKUP_DIR"
		return 0
	fi
	out=$(curl -sS -m 900 -X POST "https://api.telegram.org/bot$TOKEN/sendDocument" \
		--form-string "chat_id=$CHAT_ID" --form-string "parse_mode=HTML" --form-string "caption=$2" \
		-F "document=@$1" 2>&1) || out="curl: $out"
	case "$out" in
	'{"ok":true'*) return 0 ;;
	*)
		log "Telegram отказал: $out"
		return 1
		;;
	esac
}

fail() {
	log "ОШИБКА: $1"
	tg_text "🔴 <b>Бэкап edu3105 не сделан</b>
$1"
}

# psql_value выполняет запрос и возвращает одно значение; пустая строка, если не вышло.
psql_value() { psql -tAc "$1" 2>/dev/null || true; }

run_backup() {
	stamp=$(date '+%Y-%m-%d_%H%M')
	archive="$BACKUP_DIR/edu3105-$stamp.tar.gz"
	mkdir -p "$BACKUP_DIR"
	work=$(mktemp -d) || {
		fail "не удалось создать временный каталог"
		return 1
	}

	log "дамп базы $PGDATABASE на $PGHOST"
	if ! pg_dump --no-owner --no-privileges --clean --if-exists --file "$work/db.sql" 2>"$work/pg_dump.err"; then
		fail "pg_dump: $(tr '\n' ' ' <"$work/pg_dump.err" | cut -c1-500)"
		rm -rf "$work"
		return 1
	fi
	rm -f "$work/pg_dump.err"

	mkdir -p "$work/config"
	for path in .env docker-compose.yml deploy; do
		if [ -e "$PROJECT_DIR/$path" ]; then
			cp -a "$PROJECT_DIR/$path" "$work/config/"
		else
			log "нет $PROJECT_DIR/$path — пропускаю"
		fi
	done

	db_size=$(psql_value "select pg_size_pretty(pg_database_size(current_database()))")
	counts=$(psql_value "select 'конспектов ' || (select count(*) from notes)
		|| ', квизов ' || (select count(*) from quizzes)
		|| ', лаб ' || (select count(*) from labs)
		|| ', пользователей ' || (select count(*) from users)
		|| ', комментариев ' || (select count(*) from comments)")

	{
		echo "edu3105 — бэкап от $(date '+%Y-%m-%d %H:%M:%S %Z')"
		echo "Домен: ${DOMAIN:-неизвестно}"
		echo "База: $PGDATABASE, размер ${db_size:-неизвестно}, ${counts:-счётчики недоступны}"
		echo "Postgres: $(psql_value 'show server_version')"
		echo
		echo "Что внутри:"
		echo "  db.sql              полный дамп базы (pg_dump --clean --if-exists)"
		echo "  config/.env         секреты продакшена"
		echo "  config/docker-compose.yml"
		echo "  config/deploy/      nginx и этот скрипт"
		echo
		echo "Восстановление на чистом сервере:"
		echo "  1. распаковать репозиторий в каталог проекта на сервере"
		echo "  2. вернуть на место config/.env и config/docker-compose.yml"
		echo "  3. docker compose up -d postgres"
		echo "  4. docker compose exec -T postgres psql -U $PGUSER -d $PGDATABASE < db.sql"
		echo "  5. docker compose up -d --build"
	} >"$work/MANIFEST.txt"

	if ! tar czf "$archive" -C "$work" MANIFEST.txt db.sql config 2>/dev/null; then
		fail "не удалось собрать архив $archive"
		rm -rf "$work"
		return 1
	fi
	rm -rf "$work"

	bytes=$(wc -c <"$archive")
	human=$(du -h "$archive" | cut -f1)
	log "архив готов: $archive ($human)"

	# Оставляем на сервере последние BACKUP_KEEP архивов.
	ls -1t "$BACKUP_DIR"/edu3105-*.tar.gz 2>/dev/null | tail -n "+$((BACKUP_KEEP + 1))" | while read -r old; do
		log "удаляю старый бэкап $old"
		rm -f "$old"
	done

	if [ "$bytes" -gt "$MAX_BYTES" ]; then
		tg_text "⚠️ <b>Бэкап edu3105 от $(date '+%d.%m.%Y')</b>
Архив весит $human — больше лимита Telegram.
Лежит на сервере: <code>$archive</code>"
		return 0
	fi

	caption="💾 <b>Бэкап edu3105</b>
$(date '+%d.%m.%Y %H:%M')
База ${db_size:-?}: ${counts:-счётчики недоступны}
Внутри: db.sql, .env, docker-compose.yml, deploy/"
	if ! tg_doc "$archive" "$caption"; then
		fail "архив собран ($human), но Telegram его не принял — файл лежит на сервере: $archive"
		return 1
	fi
	log "отправлено в Telegram, чат $CHAT_ID"
}

sleep_until_hour() {
	h=$(strip0 "$(date '+%H')")
	m=$(strip0 "$(date '+%M')")
	s=$(strip0 "$(date '+%S')")
	delay=$((BACKUP_HOUR * 3600 - (h * 3600 + m * 60 + s)))
	[ "$delay" -le 0 ] && delay=$((delay + 86400))
	log "следующий бэкап через $((delay / 3600)) ч $(((delay % 3600) / 60)) мин (в $BACKUP_HOUR:00, TZ=${TZ:-UTC})"
	# Через фон + wait, чтобы контейнер останавливался сразу, а не досыпал до утра.
	sleep "$delay" &
	wait $! || true
}

case "${1:-loop}" in
once)
	run_backup
	;;
loop)
	trap 'log "остановка"; exit 0' TERM INT
	log "запущен: час бэкапа $BACKUP_HOUR, хранить последних $BACKUP_KEEP, чат ${CHAT_ID:-не задан}"
	while :; do
		sleep_until_hour
		run_backup || log "бэкап не удался, следующая попытка завтра"
	done
	;;
*)
	echo "usage: backup.sh [once|loop]" >&2
	exit 2
	;;
esac
