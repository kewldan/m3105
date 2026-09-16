# syntax=docker/dockerfile:1
# Бэкап-сайдкар: pg_dump той же мажорной версии, что и сервер, плюс curl для Bot API.
FROM postgres:18-alpine
RUN apk add --no-cache curl tzdata
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh
ENTRYPOINT ["/usr/local/bin/backup.sh"]
CMD ["loop"]
