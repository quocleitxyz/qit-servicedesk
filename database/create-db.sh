#!/bin/bash
# =============================================================================
# create-db.sh - Tao database cho mot moi truong QIT (dev / staging / prod)
# Chay tren VM database:   sudo bash create-db.sh
#   dev     -> database qit_dev_db      user qit_dev_user
#   staging -> database qit_staging_db  user qit_staging_user
#   prod    -> database qit_prod_db     user qit_prod_user
# Database tao ra la RONG; backend tu tao bang khi khoi dong.
# Neu database da ton tai, script hoi truoc khi xoa va tao lai.
# =============================================================================
set -uo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC}   $*"; }
err()  { echo -e "${RED}[LOI]${NC}  $*"; }
warn() { echo -e "${YELLOW}[CHU Y]${NC} $*"; }
die()  { err "$*"; exit 1; }

PSQL="sudo -u postgres psql -v ON_ERROR_STOP=1 -qtA"

[ "$(id -u)" -eq 0 ] || die "Hay chay bang sudo: sudo bash $0"
command -v psql >/dev/null || die "Khong tim thay psql (PostgreSQL chua cai?)"
$PSQL -c "select 1" >/dev/null 2>&1 || die "Khong ket noi duoc PostgreSQL bang user postgres"
ok "PostgreSQL dang chay"

echo "=== Tao database cho moi truong QIT ==="
read -p "Moi truong (dev / staging / prod): " ENV
case "$ENV" in dev|staging|prod) ;; *) die "Moi truong phai la dev, staging hoac prod" ;; esac
DB="qit_${ENV}_db"
DB_USER="qit_${ENV}_user"

read -p "Dai mang cua cac node K8s [10.81.10.0/24]: " SUBNET
SUBNET=${SUBNET:-10.81.10.0/24}
[[ "$SUBNET" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(/[0-9]+)?$ ]] || die "Dai mang khong hop le: $SUBNET"
read -s -p "Mat khau cho ${DB_USER} (nho de tao Secret tren K8s): " PASS; echo
[ -n "$PASS" ] || die "Chua nhap mat khau"
read -s -p "Nhap lai mat khau: " PASS2; echo
[ "$PASS" = "$PASS2" ] || die "Hai lan nhap khong khop"

if [ "$($PSQL -c "select 1 from pg_database where datname='${DB}'")" = "1" ]; then
  warn "Database ${DB} da ton tai"
  [ "$ENV" = "prod" ] && warn "DAY LA DATABASE PRODUCTION - xoa la mat toan bo du lieu that"
  read -p "Go ten database (${DB}) de XOA SACH va tao lai, hoac Enter de huy: " CONFIRM
  [ "$CONFIRM" = "$DB" ] || die "Da huy, khong thay doi gi"
fi

echo "--- 1. User ${DB_USER}"
if [ "$($PSQL -c "select 1 from pg_roles where rolname='${DB_USER}'")" = "1" ]; then
  echo "ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD :'pw';" | $PSQL -v pw="$PASS" \
    && ok "Da cap nhat mat khau ${DB_USER}" || die "Khong doi duoc mat khau"
else
  echo "CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD :'pw';" | $PSQL -v pw="$PASS" \
    && ok "Da tao user ${DB_USER}" || die "Khong tao duoc user"
fi

echo "--- 2. Database ${DB}"
$PSQL -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='${DB}'" >/dev/null
$PSQL -c "DROP DATABASE IF EXISTS ${DB}" || die "Khong xoa duoc ${DB}"
$PSQL -c "CREATE DATABASE ${DB} OWNER ${DB_USER}" || die "Khong tao duoc ${DB}"
# Moi moi truong chi vao duoc database cua chinh no.
$PSQL -c "REVOKE CONNECT ON DATABASE ${DB} FROM PUBLIC" -c "GRANT CONNECT ON DATABASE ${DB} TO ${DB_USER}" >/dev/null \
  && ok "Da tao database ${DB} (chi ${DB_USER} duoc ket noi)" || warn "Khong gioi han duoc quyen CONNECT tren ${DB}"

echo "--- 3. Cho phep ket noi tu cum (pg_hba.conf)"
HBA=$($PSQL -c "show hba_file")
LINE="host    ${DB}    ${DB_USER}    ${SUBNET}    scram-sha-256"
if grep -qE "^host\s+${DB}\s+${DB_USER}\s" "$HBA"; then
  ok "pg_hba.conf da co dong cho ${DB}"
else
  echo "$LINE" >> "$HBA" || die "Khong ghi duoc ${HBA}"
  $PSQL -c "select pg_reload_conf()" >/dev/null && ok "Da them vao ${HBA} va reload" || die "Reload that bai"
fi

echo "--- 4. Kiem tra"
LISTEN=$($PSQL -c "show listen_addresses")
[ "$LISTEN" = "localhost" ] && warn "PostgreSQL chi nghe tren localhost: sua listen_addresses = '*' trong postgresql.conf roi restart" \
  || ok "listen_addresses = ${LISTEN}"
if PGPASSWORD="$PASS" psql -h 127.0.0.1 -U "$DB_USER" -d "$DB" -qtA -c "select 1" >/dev/null 2>&1; then
  ok "Dang nhap thu bang ${DB_USER} vao ${DB} thanh cong"
else
  warn "Chua dang nhap thu duoc qua 127.0.0.1 (kiem tra dong 'host all all 127.0.0.1/32' trong pg_hba.conf)"
fi

echo
ok "Xong. Chay tren k8s-master de tao Secret database:"
echo "  kubectl create secret generic qit-db-secret -n qit-${ENV} \\"
echo "    --from-literal=DB_USER=${DB_USER} --from-literal=DB_PASSWORD='<mat khau vua nhap>'"
