#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
COMPOSE_FILE=${COMPOSE_FILE:-"$SCRIPT_DIR/docker-compose.yml"}
ENV_FILE=${ENV_FILE:-"$SCRIPT_DIR/.env.production"}

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "Docker chưa được cài trên server."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 chưa được cài."
[ -f "$ENV_FILE" ] || fail "Thiếu $ENV_FILE. Hãy copy .env.production.example và điền secret thật."
[ -f "$COMPOSE_FILE" ] || fail "Không tìm thấy $COMPOSE_FILE."

required_keys="DATABASE_URL RDS_CA_CERT_FILE AWS_REGION S3_IMAGE_BUCKET ALLOWED_ORIGIN ADMIN_USERNAME ADMIN_PASSWORD"
for key in $required_keys; do
  value=$(sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1)
  [ -n "$value" ] || fail "Thiếu biến $key trong $ENV_FILE."
  case "$value" in
    *CHANGE_ME*) fail "$key vẫn đang dùng giá trị mẫu." ;;
  esac
done

rds_ca_file=$(sed -n 's/^RDS_CA_CERT_FILE=//p' "$ENV_FILE" | tail -n 1)
[ -f "$rds_ca_file" ] || fail "Không tìm thấy RDS CA certificate: $rds_ca_file"

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

printf '%s\n' "[1/6] Kiểm tra cấu hình Compose"
compose config --quiet

printf '%s\n' "[2/6] Build image"
compose build --pull

printf '%s\n' "[3/6] Chạy migration PostgreSQL"
compose --profile setup run --rm migrate

printf '%s\n' "[4/6] Tạo admin ban đầu theo cách idempotent"
compose --profile setup run --rm seed-admin

printf '%s\n' "[5/6] Khởi động backend và frontend"
compose up -d --remove-orphans

printf '%s\n' "[6/6] Chờ backend sẵn sàng"
attempt=0
while [ "$attempt" -lt 60 ]; do
  container_id=$(compose ps -q backend)
  if [ -n "$container_id" ]; then
    health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)
    if [ "$health" = "healthy" ]; then
      public_origin=$(sed -n 's/^ALLOWED_ORIGIN=//p' "$ENV_FILE" | tail -n 1)
      printf '\nDeploy thành công: %s\n' "$public_origin"
      compose ps
      exit 0
    fi
    if [ "$health" = "unhealthy" ] || [ "$health" = "exited" ]; then
      compose logs --no-color --tail=120 backend frontend
      fail "Container backend không healthy."
    fi
  fi
  attempt=$((attempt + 1))
  sleep 2
done

compose logs --no-color --tail=120 backend frontend
fail "Hết thời gian chờ backend sẵn sàng."
