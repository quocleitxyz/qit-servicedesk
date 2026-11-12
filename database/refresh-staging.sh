#!/bin/bash
# =============================================================================
# refresh-staging.sh - Tao / lam moi database qit_staging_db tu du lieu production
# Chay tren VM database:   sudo bash refresh-staging.sh
# Lan dau: tao user qit_staging_user + database qit_staging_db + dong pg_hba.
# Cac lan sau: xoa qit_staging_db va chep lai du lieu moi nhat tu qit.
# =============================================================================
set -uo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC}   $*"; }
err()  { echo -e "${RED}[LOI]${NC}  $*"; }
warn() { echo -e "${YELLOW}[CHU Y]${NC} $*"; }
die()  { err "$*"; exit 1; }

PROD_DB=qit_prod_db
STG_DB=qit_staging_db
STG_USER=qit_staging_user
PSQL="sudo -u postgres psql -v ON_ERROR_STOP=1 -qtA"

[ "$(id -u)" -eq 0 ] || die "Hay chay bang sudo: sudo bash $0"
command -v psql >/dev/null || die "Khong tim thay psql (PostgreSQL chua cai?)"

echo "=== Lam moi database ${STG_DB} tu ${PROD_DB} ==="
$PSQL -c "select 1" >/dev/null 2>&1 || die "Khong ket noi duoc PostgreSQL bang user postgres"
[ "$($PSQL -c "select 1 from pg_database where datname='${PROD_DB}'")" = "1" ] || die "Khong co database ${PROD_DB}"
ok "PostgreSQL dang chay, co database ${PROD_DB}"

read -s -p "Mat khau cho ${STG_USER} (nho de tao Secret tren K8s): " STG_PASS; echo
[ -n "$STG_PASS" ] || die "Chua nhap mat khau"
read -s -p "Nhap lai mat khau: " STG_PASS2; echo
[ "$STG_PASS" = "$STG_PASS2" ] || die "Hai lan nhap khong khop"

read -p "Se XOA va tao lai database ${STG_DB}. Tiep tuc? (y/N): " GO
[[ "${GO:-N}" =~ ^[Yy]$ ]] || die "Da huy"

echo "--- 1. User ${STG_USER}"
if [ "$($PSQL -c "select 1 from pg_roles where rolname='${STG_USER}'")" = "1" ]; then
  echo "ALTER ROLE ${STG_USER} WITH LOGIN PASSWORD :'pw';" | $PSQL -v pw="$STG_PASS" \
    && ok "Da cap nhat mat khau ${STG_USER}" || die "Khong doi duoc mat khau"
else
  echo "CREATE ROLE ${STG_USER} WITH LOGIN PASSWORD :'pw';" | $PSQL -v pw="$STG_PASS" \
    && ok "Da tao user ${STG_USER}" || die "Khong tao duoc user"
fi

$PSQL -c "REVOKE CONNECT ON DATABASE ${PROD_DB} FROM PUBLIC" -c "GRANT CONNECT ON DATABASE ${PROD_DB} TO qit_prod_user" >/dev/null \
  && ok "${STG_USER} khong vao duoc database ${PROD_DB}" || warn "Khong khoa duoc quyen CONNECT tren ${PROD_DB}"

echo "--- 2. Database ${STG_DB}"
$PSQL -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='${STG_DB}'" >/dev/null
$PSQL -c "DROP DATABASE IF EXISTS ${STG_DB}" || die "Khong xoa duoc ${STG_DB}"
$PSQL -c "CREATE DATABASE ${STG_DB} OWNER ${STG_USER}" || die "Khong tao duoc ${STG_DB}"
ok "Da tao database ${STG_DB} (owner ${STG_USER})"

echo "--- 3. Cho phep ket noi tu cum (pg_hba.conf)"
HBA=$($PSQL -c "show hba_file")
LINE="host    ${STG_DB}    ${STG_USER}    10.81.10.0/24    scram-sha-256"
if grep -qE "^host\s+${STG_DB}\s+${STG_USER}\s" "$HBA"; then
  ok "pg_hba.conf da co dong cho ${STG_DB}"
else
  echo "$LINE" >> "$HBA"
  $PSQL -c "select pg_reload_conf()" >/dev/null && ok "Da them vao ${HBA} va reload" || die "Reload that bai"
fi

echo "--- 4. Chep du lieu ${PROD_DB} -> ${STG_DB}"
if sudo -u postgres pg_dump --no-owner --no-privileges "$PROD_DB" \
   | PGPASSWORD="$STG_PASS" psql -v ON_ERROR_STOP=1 -q -h 127.0.0.1 -U "$STG_USER" -d "$STG_DB" >/dev/null; then
  ok "Da chep du lieu (moi bang deu thuoc ${STG_USER})"
else
  die "Chep du lieu that bai (kiem tra pg_hba dong 'host all all 127.0.0.1/32')"
fi

echo "--- 5. Kiem tra"
for t in users tickets categories; do
  P=$($PSQL -d "$PROD_DB" -c "select count(*) from ${t}" 2>/dev/null || echo "-")
  S=$($PSQL -d "$STG_DB" -c "select count(*) from ${t}" 2>/dev/null || echo "-")
  [ "$P" = "$S" ] && ok "${t}: production=${P}, staging=${S}" || warn "${t}: production=${P}, staging=${S}"
done

echo
ok "Xong. Neu vua doi mat khau, cap nhat Secret qit-db-secret trong namespace qit-staging."
