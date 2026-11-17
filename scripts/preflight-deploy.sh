#!/usr/bin/env bash
#
# شناخت محیط مستقر، پیش از دیپلوی نسخهٔ تازه.
#
# این اسکریپت **فقط می‌خواند**: هیچ کانتینری را بالا/پایین نمی‌برد، هیچ مهاجرتی
# اجرا نمی‌کند، هیچ ردیفی در پایگاه داده عوض نمی‌شود، و هیچ فایلی بیرون از مسیر
# خروجی خودش نمی‌نویسد. تنها دستورهای نوشتنی‌اش `mkdir -p` برای پوشهٔ خروجی است.
#
# چرا یک اسکریپت و نه یک فهرست دستور: جوابِ «چه چیزی روی این ماشین در حال اجراست»
# از ده جا می‌آید و هر بار که دستی جمع شود، یک جایش جا می‌افتد — همان جایی که
# دیپلوی رویش می‌شکند.
#
#   اجرا (روی خودِ ماشین مستقر، یا با ssh):
#       bash scripts/preflight-deploy.sh
#       bash scripts/preflight-deploy.sh --out /tmp/dm-preflight.txt
#       ssh user@host 'bash -s' < scripts/preflight-deploy.sh > preflight.txt
#
#   گزینه‌ها:
#       --out FILE     خروجی در این فایل هم ذخیره شود (پیش‌فرض: /tmp/dm-preflight-<زمان>.txt)
#       --app NAME     نام کانتینر برنامه (پیش‌فرض: خودکار)
#       --pg NAME      نام کانتینر پایگاه داده (پیش‌فرض: خودکار)
#       --url URL      آدرس پایهٔ سرویس برای سلامت (پیش‌فرض: http://127.0.0.1:3100)
#       --no-db        هیچ پرسشی به پایگاه داده زده نشود
#       --sizes        اندازهٔ volume‌ها هم حساب شود (کند است: du روی دیسک)
#       --tail N       چند خط آخر لاگ بررسی شود (پیش‌فرض: 400)
#       --no-color     بدون رنگ
#
# رمزها چاپ نمی‌شوند: هر متغیری که نامش بوی راز بدهد تنها با «تنظیم شده (طول N)»
# گزارش می‌شود، و `DATABASE_URL` با رمزِ پوشانده. خروجی این اسکریپت را می‌توانید
# بی‌نگرانی بفرستید — ولی یک بار خودتان نگاهش کنید، چون هیچ پوشاننده‌ای کامل نیست.

set -uo pipefail

SCRIPT_VERSION='1.0'
APP_NAME=''
PG_NAME=''
BASE_URL='http://127.0.0.1:3100'
OUT_FILE=''
DO_DB=1
DO_SIZES=0
LOG_TAIL=400
USE_COLOR=1

while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT_FILE="${2:-}"; shift 2 ;;
    --app) APP_NAME="${2:-}"; shift 2 ;;
    --pg) PG_NAME="${2:-}"; shift 2 ;;
    --url) BASE_URL="${2:-}"; shift 2 ;;
    --no-db) DO_DB=0; shift ;;
    --sizes) DO_SIZES=1; shift ;;
    --tail) LOG_TAIL="${2:-400}"; shift 2 ;;
    --no-color) USE_COLOR=0; shift ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "گزینهٔ ناشناخته: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$OUT_FILE" ]; then
  OUT_FILE="/tmp/dm-preflight-$(date +%Y%m%d-%H%M%S).txt"
fi
mkdir -p "$(dirname "$OUT_FILE")" 2>/dev/null

# از این‌جا به بعد همهٔ خروجی هم روی صفحه می‌رود و هم در فایل.
exec > >(tee "$OUT_FILE") 2>&1

if [ "$USE_COLOR" = 1 ] && [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_BAD=$'\033[31m'; C_DIM=$'\033[2m'
else
  C_RESET=''; C_OK=''; C_WARN=''; C_BAD=''; C_DIM=''
fi

N_OK=0; N_WARN=0; N_BAD=0
WARN_LIST=()
BAD_LIST=()

section() { printf '\n%s\n── %s\n' "────────────────────────────────────────────────────────────" "$1"; }
sub()     { printf '\n  %s\n' "· $1"; }
ok()      { N_OK=$((N_OK+1));  printf '  %sOK  %s %s\n' "$C_OK" "$C_RESET" "$1"; }
warn()    { N_WARN=$((N_WARN+1)); WARN_LIST+=("$1"); printf '  %sWARN%s %s\n' "$C_WARN" "$C_RESET" "$1"; }
bad()     { N_BAD=$((N_BAD+1)); BAD_LIST+=("$1"); printf '  %sFAIL%s %s\n' "$C_BAD" "$C_RESET" "$1"; }
info()    { printf '  %s–%s    %s\n' "$C_DIM" "$C_RESET" "$1"; }
raw()     { sed 's/^/      /'; }
have()    { command -v "$1" >/dev/null 2>&1; }

# اجرای یک دستور با سقف زمانی، تا یک ابزار معلق کل اسکریپت را نخواباند.
t() {
  if have timeout; then timeout 20 "$@"; else "$@"; fi
}

# نام‌هایی که مقدارشان چاپ نمی‌شود.
is_secret() {
  case "$1" in
    *SECRET*|*PASSWORD*|*PASSWD*|*TOKEN*|*PRIVATE*|*_KEY|*APIKEY*|*ACCESS_KEY*|PGPASSWORD) return 0 ;;
    *) return 1 ;;
  esac
}

# DATABASE_URL با رمزِ پوشانده — هم برای چاپ، هم برای اینکه در لاگ شما نماند.
sanitize_url() { printf '%s' "$1" | sed -E 's#(://[^:/@]+):[^@]*@#\1:***@#'; }

printf '%s\n' "════════════════════════════════════════════════════════════"
printf 'گزارش پیش‌از‌دیپلوی — Document Manager (اسکریپت نسخهٔ %s)\n' "$SCRIPT_VERSION"
printf '%s\n' "════════════════════════════════════════════════════════════"
info "زمان اجرا: $(date '+%Y-%m-%d %H:%M:%S %z')"
info "میزبان: $(hostname 2>/dev/null || echo '?')   کاربر: $(id -un 2>/dev/null || echo '?')"
info "خروجی در: $OUT_FILE"
if [ "$(id -u 2>/dev/null || echo 1)" != 0 ] && ! (have docker && docker info >/dev/null 2>&1); then
  warn "نه root هستید و نه به داکر دسترسی دارید؛ بخش‌های داکر خالی می‌مانند (با sudo اجرا کنید)"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "۱. میزبان"

if [ -r /etc/os-release ]; then
  info "سیستم‌عامل: $(. /etc/os-release 2>/dev/null; printf '%s' "${PRETTY_NAME:-?}")"
else
  info "سیستم‌عامل: $(uname -s)"
fi
info "کرنل: $(uname -r)   معماری: $(uname -m)"
info "بالا بودن: $(uptime -p 2>/dev/null || uptime 2>/dev/null | tr -s ' ')"
info "بار سیستم: $(cat /proc/loadavg 2>/dev/null | cut -d' ' -f1-3 || echo '?')"
info "پردازنده: $(nproc 2>/dev/null || echo '?') هسته"

# ساعت و منطقهٔ زمانی: تاریخ شمسیِ سند و زمان‌بندی پشتیبان هر دو به همین بند بندند.
if have timedatectl; then
  t timedatectl 2>/dev/null | sed -n '1,8p' | raw
else
  info "منطقهٔ زمانی: ${TZ:-$(cat /etc/timezone 2>/dev/null || echo '?')}"
fi
if have timedatectl && t timedatectl show -p NTPSynchronized --value 2>/dev/null | grep -qi '^yes$'; then
  ok "ساعت با NTP هم‌زمان است"
elif have timedatectl; then
  warn "ساعت با NTP هم‌زمان نیست — تاریخ/ساعت اسناد و نام فایل پشتیبان به همین ساعت است"
fi

sub "حافظه"
free -h 2>/dev/null | raw || info "free در دسترس نیست"

sub "دیسک"
# ریشهٔ داکر همیشه /var/lib/docker نیست؛ روی سرور واقعی /mnt/app-data/docker بود و
# df از آن بی‌خبر می‌ماند — یعنی همان دیسکی که ایمیج تازه باید در آن جا شود، اندازه‌اش
# گزارش نمی‌شد. مسیرش را از خود داکر می‌پرسیم.
DOCKER_ROOT=''
if command -v docker >/dev/null 2>&1; then
  DOCKER_ROOT=$(docker info -f '{{.DockerRootDir}}' 2>/dev/null)
fi
df -hP / /var "${DOCKER_ROOT:-/var/lib/docker}" /var/lib/docker /opt 2>/dev/null \
  | awk 'NR==1 || !seen[$1]++' | raw
for mp in / "${DOCKER_ROOT:-/var/lib/docker}"; do
  # ستون درصد، `NF-1` است و نه `$5`: نام دستگاه می‌تواند فاصله داشته باشد و
  # ستون‌ها را جابه‌جا کند (روی همین ماشین دیده شد).
  use=$(df -P "$mp" 2>/dev/null | awk 'NR==2{gsub("%","",$(NF-1)); print $(NF-1)}')
  case "${use:-}" in ''|*[!0-9]*) continue ;; esac
  [ -z "${use:-}" ] && continue
  if [ "$use" -ge 90 ]; then
    bad "فضای $mp بالای ۹۰٪ پر است (${use}%) — ساخت ایمیج و پشتیبان جا نمی‌گیرند"
  elif [ "$use" -ge 80 ]; then
    warn "فضای $mp بالای ۸۰٪ پر است (${use}%)"
  else
    ok "فضای $mp قابل قبول است (${use}%)"
  fi
done
sub "inode (پوشهٔ پشتیبان و داکر هر دو فایل‌محورند)"
df -iP / /var/lib/docker 2>/dev/null | awk 'NR==1 || !seen[$1]++' | raw

# ─────────────────────────────────────────────────────────────────────────────
section "۲. داکر"

if ! have docker; then
  bad "docker روی این ماشین نیست — بقیهٔ گزارش تقریباً خالی می‌ماند"
  DOCKER_OK=0
elif ! t docker info >/dev/null 2>&1; then
  bad "docker نصب است ولی daemon جواب نمی‌دهد (یا دسترسی ندارید) — با sudo امتحان کنید"
  DOCKER_OK=0
else
  DOCKER_OK=1
  ok "داکر در دسترس است: $(docker --version 2>/dev/null)"
  if docker compose version >/dev/null 2>&1; then
    DC='docker compose'
    ok "compose نسخهٔ ۲: $(docker compose version --short 2>/dev/null)"
  elif have docker-compose; then
    DC='docker-compose'
    warn "فقط compose نسخهٔ ۱ هست ($(docker-compose --version 2>/dev/null)) — دستورهای سند با 'docker compose' نوشته شده‌اند"
  else
    DC=''
    info "compose نصب نیست؛ اگر سرویس‌ها با docker run بالا آمده‌اند مشکلی نیست"
  fi

  info "درایور ذخیره: $(docker info -f '{{.Driver}}' 2>/dev/null)   لاگ: $(docker info -f '{{.LoggingDriver}}' 2>/dev/null)"
  info "ریشهٔ داکر: $(docker info -f '{{.DockerRootDir}}' 2>/dev/null)"
  info "ایمیج‌ها: $(docker info -f '{{.Images}}' 2>/dev/null)   کانتینرهای در حال اجرا: $(docker info -f '{{.ContainersRunning}}' 2>/dev/null) از $(docker info -f '{{.Containers}}' 2>/dev/null)"

  sub "فضای مصرفی داکر (docker system df)"
  t docker system df 2>/dev/null | raw

  sub "کانتینرها"
  t docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null \
    | column -t -s "$(printf '\t')" 2>/dev/null | raw \
    || t docker ps -a 2>/dev/null | raw

  sub "volume‌ها"
  t docker volume ls 2>/dev/null | raw

  sub "شبکه‌ها"
  t docker network ls 2>/dev/null | raw
fi

# ─────────────────────────────────────────────────────────────────────────────
section "۳. شناسایی سرویس‌ها"

# فهرست کانتینرها، اگر پروژهٔ compose داده شود فقط همان پروژه.
list_containers() {
  if [ -n "${1:-}" ]; then
    docker ps -a --filter "label=com.docker.compose.project=$1" --format '{{.Names}}\t{{.Image}}' 2>/dev/null
  else
    docker ps -a --format '{{.Names}}\t{{.Image}}' 2>/dev/null
  fi
}

# ورودی: الگوها **به ترتیب اولویت**، هر کدام یک آرگومان جدا.
#
# چرا جدا و نه یک الگوی `a|b`: روی ماشینی که چند استک دارد، گرپِ یکجا اولین خطِ
# فهرست را می‌دهد و نه مرتبط‌ترین را — روی همین ماشین، `postgres` یک پروژهٔ دیگر
# پیش از `dm-postgres` می‌افتاد. اولویت را خودمان می‌گذاریم، نه ترتیب docker ps.
pick_container() {
  local scope="$1"; shift
  local pat found
  for pat in "$@"; do
    found=$(list_containers "$scope" | grep -iE "$pat" | head -1 | cut -f1)
    if [ -n "$found" ]; then printf '%s' "$found"; return 0; fi
  done
  return 1
}

APP=''; PG=''; S3C=''; PROXY=''; BACKUPC=''; PROJ=''
if [ "${DOCKER_OK:-0}" = 1 ]; then
  APP="${APP_NAME:-$(pick_container '' 'dm-app' 'document-manager' 'dm[-_]api' 'dm[-_]app' || true)}"

  # هم‌استکی مهم‌تر از هم‌نامی است: اگر برنامه با compose بالا آمده، بقیهٔ سرویس‌ها
  # را **اول در همان پروژه** می‌گردیم تا postgresِ یک استک دیگر اشتباه گرفته نشود.
  if [ -n "$APP" ]; then
    PROJ=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$APP" 2>/dev/null)
    [ "${PROJ:-}" = '<no value>' ] && PROJ=''
    [ -n "$PROJ" ] && info "پروژهٔ compose برنامه: $PROJ (بقیهٔ سرویس‌ها اول در همین پروژه گشته می‌شوند)"
  fi

  pick2() { # اول در پروژه، بعد همه‌جا
    local r
    if [ -n "$PROJ" ]; then r=$(pick_container "$PROJ" "$@" || true); [ -n "$r" ] && { printf '%s' "$r"; return 0; }; fi
    pick_container '' "$@"
  }

  PG="${PG_NAME:-$(pick2 'dm-postgres' 'postgres' 'pgsql' || true)}"
  S3C="$(pick2 'dm-s3' 'seaweed' 'minio' || true)"
  PROXY="$(pick2 'nginx' 'caddy' 'traefik' 'haproxy' || true)"
  BACKUPC="$(pick2 'backup' || true)"

  if [ -z "$PROJ" ] && [ "$(list_containers '' | wc -l)" -gt 4 ]; then
    warn "روی این ماشین چند استک داکر هست و برنامه برچسب compose ندارد؛ نام کانتینرهای حدس‌زده‌شده را پایین بسنجید (و در صورت لزوم --app/--pg بدهید)"
  fi

  [ -n "$APP" ]     && ok "کانتینر برنامه: $APP"            || bad "کانتینر برنامه پیدا نشد (با --app نامش را بدهید)"
  [ -n "$PG" ]      && ok "کانتینر پایگاه داده: $PG"        || warn "کانتینر postgres پیدا نشد — شاید پایگاه داده بیرون از داکر است"
  [ -n "$S3C" ]     && ok "کانتینر ذخیره‌سازی: $S3C"        || warn "کانتینر S3 پیدا نشد — پیوست‌ها و خروجی‌های صف‌شده بی آن کار نمی‌کنند"
  [ -n "$PROXY" ]   && info "پروکسی: $PROXY"                || info "پروکسی در داکر نیست (ممکن است روی خود میزبان باشد — بند ۸)"
  [ -n "$BACKUPC" ] && info "سرویس پشتیبان: $BACKUPC"       || info "سرویس پشتیبان در داکر نیست (ممکن است cron باشد — بند ۷)"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "۴. سرویس برنامه"

if [ -z "$APP" ]; then
  warn "بدون کانتینر برنامه، این بند رد می‌شود"
else
  IMG=$(docker inspect -f '{{.Config.Image}}' "$APP" 2>/dev/null)
  IMGID=$(docker inspect -f '{{.Image}}' "$APP" 2>/dev/null)
  info "ایمیج: $IMG"
  info "شناسهٔ ایمیج: ${IMGID:0:19}"
  info "ساختِ ایمیج: $(docker image inspect -f '{{.Created}}' "$IMGID" 2>/dev/null)"
  info "راه‌اندازی کانتینر: $(docker inspect -f '{{.State.StartedAt}}' "$APP" 2>/dev/null)"
  info "وضعیت: $(docker inspect -f '{{.State.Status}}' "$APP" 2>/dev/null)   سلامتِ داکر: $(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}بدون healthcheck{{end}}' "$APP" 2>/dev/null)"
  info "سیاست راه‌اندازی مجدد: $(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$APP" 2>/dev/null)   تعداد راه‌اندازی مجدد: $(docker inspect -f '{{.RestartCount}}' "$APP" 2>/dev/null)"

  RC=$(docker inspect -f '{{.RestartCount}}' "$APP" 2>/dev/null)
  if [ "${RC:-0}" -gt 3 ] 2>/dev/null; then
    warn "کانتینر برنامه $RC بار راه‌اندازی مجدد شده — پیش از دیپلوی دلیلش را در لاگ ببینید"
  fi

  sub "از کجا بالا آمده (برچسب‌های compose)"
  docker inspect -f '{{range $k,$v := .Config.Labels}}{{$k}}={{$v}}
{{end}}' "$APP" 2>/dev/null | grep -iE 'compose|version|revision|image' | raw \
    || info "برچسبی نیست — احتمالاً با docker run بالا آمده است"
  CFG=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$APP" 2>/dev/null)
  WDIR=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$APP" 2>/dev/null)
  if [ -n "${CFG:-}" ] && [ "$CFG" != '<no value>' ]; then
    ok "فایل compose سرویس: $CFG"
    info "پوشهٔ کاری compose: ${WDIR:-?}"
  else
    warn "این کانتینر با compose بالا نیامده؛ برای دیپلوی باید همان 'docker run' با همهٔ -e‌ها بازسازی شود (بند ۵ همین گزارش فهرست متغیرها را دارد)"
  fi

  sub "فرمان و نقطهٔ ورود"
  docker inspect -f 'Entrypoint: {{json .Config.Entrypoint}}{{printf "\n"}}Cmd:        {{json .Config.Cmd}}{{printf "\n"}}User:       {{.Config.User}}' "$APP" 2>/dev/null | raw

  sub "پورت‌های منتشرشده"
  docker port "$APP" 2>/dev/null | raw || info "پورتی منتشر نشده"

  sub "mount‌ها"
  docker inspect -f '{{range .Mounts}}{{.Type}}  {{.Source}} → {{.Destination}} ({{if .RW}}rw{{else}}ro{{end}}){{printf "\n"}}{{end}}' "$APP" 2>/dev/null | raw

  sub "متغیرهای محیطی (رازها پوشانده)"
  # این فهرست مهم‌ترین چیزی است که برای بازسازی سرویس لازم است.
  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$APP" 2>/dev/null \
  | while IFS= read -r line; do
      [ -z "$line" ] && continue
      k=${line%%=*}; v=${line#*=}
      case "$k" in
        PATH|HOME|HOSTNAME|TERM|NODE_VERSION|YARN_VERSION|LANG|LC_ALL) continue ;;
      esac
      if [ "$k" = 'DATABASE_URL' ]; then
        printf '      %s=%s\n' "$k" "$(sanitize_url "$v")"
      elif is_secret "$k"; then
        printf '      %s=<پوشانده> (طول %s)\n' "$k" "${#v}"
      else
        printf '      %s=%s\n' "$k" "$v"
      fi
    done

  # بندهای حساسِ سند تحویل (docs/18 §۶) و سند ارتقا.
  APP_ENV=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$APP" 2>/dev/null)
  getenv() { printf '%s' "$APP_ENV" | grep -E "^$1=" | head -1 | cut -d= -f2- ; }

  SS=$(getenv SESSION_SECRET)
  if [ -z "$SS" ]; then bad "SESSION_SECRET تنظیم نشده"
  elif [ "${#SS}" -lt 32 ]; then bad "SESSION_SECRET کوتاه‌تر از ۳۲ نویسه است (${#SS})"
  elif printf '%s' "$SS" | grep -qiE 'dev_only|change_me|example'; then bad "SESSION_SECRET مقدار نمونه است"
  else ok "SESSION_SECRET تنظیم شده و بلند است (${#SS} نویسه)"; fi

  EQC=$(getenv EXPOSE_QUERY_COUNT)
  if [ "${EQC:-false}" = 'true' ]; then bad "EXPOSE_QUERY_COUNT=true است — ابزار تشخیصی روی production"; else ok "EXPOSE_QUERY_COUNT خاموش است"; fi

  NE=$(getenv NODE_ENV)
  [ "${NE:-}" = 'production' ] && ok "NODE_ENV=production" || warn "NODE_ENV مقدارش '${NE:-<خالی>}' است و نه production"

  RM=$(getenv RUN_MIGRATIONS); RS=$(getenv RUN_SEED)
  info "RUN_MIGRATIONS=${RM:-<تنظیم نشده>}   RUN_SEED=${RS:-<تنظیم نشده>}"
  info "(برای این ارتقا هر دو لازم‌اند: مهاجرت چیزی برای اجرا ندارد ولی بی‌خطر است، و seed مجوزها و قالب‌های تازه را می‌آورد)"

  for v in S3_ENDPOINT S3_BUCKET S3_REGION S3_FORCE_PATH_STYLE WEB_ORIGIN TRUST_PROXY API_PORT SESSION_IDLE_TTL_MINUTES SESSION_ABSOLUTE_TTL_MINUTES; do
    val=$(getenv "$v")
    [ -n "$val" ] && info "$v=$val" || info "$v=<تنظیم نشده> (پیش‌فرض کد)"
  done
  [ -n "$(getenv S3_ACCESS_KEY)" ] && ok "کلیدهای S3 تنظیم شده‌اند" || warn "S3_ACCESS_KEY تنظیم نشده — آپلود پیوست و خروجی صف‌شده کار نمی‌کند"

  sub "سلامت سرویس"
  # اول **از داخل کانتینر** و بعد از میزبان.
  #
  # ترتیبش عمدی است: سرویسی که پشت پروکسی نشسته، لازم نیست پورتش را روی میزبان
  # منتشر کند — و نکردنش درست‌تر هم هست. روی سرور واقعی همین‌طور بود و آزمونِ
  # میزبان‌محور یک FAIL دروغ داد: سرویس سالم بود و فقط از 127.0.0.1 دیده نمی‌شد.
  probe() { # مسیر را از داخل کانتینر برنامه می‌گیرد
    docker exec "$APP" node -e "
      const p='$1';
      fetch('http://127.0.0.1:'+(process.env.API_PORT||3100)+p)
        .then(r=>r.text()).then(t=>console.log(t.slice(0,200)))
        .catch(e=>{console.log('ERR '+e.message);process.exit(1)})" 2>/dev/null
  }
  H=$(t probe /api/v1/health)
  R=$(t probe /api/v1/health/ready)
  if printf '%s' "$H" | grep -q '"status"'; then
    ok "از داخل کانتینر: /api/v1/health → $H"
  else
    H2=''; [ -n "$(command -v curl)" ] && H2=$(t curl -fsS --max-time 10 "$BASE_URL/api/v1/health" 2>/dev/null)
    if [ -n "$H2" ]; then ok "از میزبان: /api/v1/health → $H2"
    else bad "سلامت نه از داخل کانتینر جواب داد و نه از $BASE_URL — سرویس واقعاً بالا نیست"; fi
  fi
  if printf '%s' "$R" | grep -q '"database":true'; then
    ok "اتصال سرویس به پایگاه داده برقرار است (/health/ready → $R)"
  elif printf '%s' "$R" | grep -q '"status"'; then
    bad "/health/ready می‌گوید پایگاه داده سالم نیست: $R"
  else
    warn "/health/ready خوانده نشد (پاسخ: ${R:-<خالی>})"
  fi

  PORTS=$(docker port "$APP" 2>/dev/null)
  if [ -z "$PORTS" ]; then
    if [ -n "$PROXY" ]; then
      ok "پورت برنامه روی میزبان منتشر نشده و پروکسی ($PROXY) هست — همین درست است: سرویس فقط از شبکهٔ داکر در دسترس است"
    else
      warn "پورت برنامه منتشر نشده و پروکسی‌ای هم پیدا نشد — پس از بیرون چطور به سرویس می‌رسند؟"
    fi
  fi

  sub "لاگ — $LOG_TAIL خط آخر، فقط خطاها"
  LOGS=$(t docker logs --tail "$LOG_TAIL" "$APP" 2>&1)
  ERRS=$(printf '%s' "$LOGS" | grep -icE '"level":(50|60)|\berror\b|\bfatal\b|unhandled|ECONNREFUSED|ETIMEDOUT' 2>/dev/null)
  if [ "${ERRS:-0}" -gt 0 ]; then
    warn "$ERRS خط خطا در $LOG_TAIL خط آخر لاگ — ده مورد آخر:"
    printf '%s' "$LOGS" | grep -iE '"level":(50|60)|\berror\b|\bfatal\b|unhandled|ECONNREFUSED|ETIMEDOUT' | tail -10 | cut -c1-400 | raw
  else
    ok "در $LOG_TAIL خط آخر لاگ، خطایی نیست"
  fi
  sub "پنج خط آخر لاگ (هر سطحی)"
  printf '%s' "$LOGS" | tail -5 | cut -c1-400 | raw
fi

# ─────────────────────────────────────────────────────────────────────────────
section "۵. پایگاه داده"

PSQL_MODE='none'
PGUSER_V=''; PGDB_V=''
if [ "$DO_DB" = 0 ]; then
  info "با --no-db رد شد"
elif [ -n "$PG" ]; then
  PGENV=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$PG" 2>/dev/null)
  PGUSER_V=$(printf '%s' "$PGENV" | grep -E '^POSTGRES_USER=' | head -1 | cut -d= -f2-)
  PGDB_V=$(printf '%s' "$PGENV" | grep -E '^POSTGRES_DB=' | head -1 | cut -d= -f2-)
  PGUSER_V=${PGUSER_V:-postgres}; PGDB_V=${PGDB_V:-postgres}
  if t docker exec "$PG" psql -U "$PGUSER_V" -d "$PGDB_V" -Atc 'select 1' >/dev/null 2>&1; then
    PSQL_MODE='container'
    ok "psql داخل کانتینر $PG کار می‌کند (کاربر $PGUSER_V، پایگاه داده $PGDB_V)"
  else
    warn "psql داخل کانتینر $PG جواب نداد"
  fi
elif have psql && [ -n "${DATABASE_URL:-}" ]; then
  PSQL_MODE='host'
  ok "psql روی میزبان با DATABASE_URL استفاده می‌شود: $(sanitize_url "$DATABASE_URL")"
else
  warn "راهی به پایگاه داده پیدا نشد (نه کانتینر postgres، نه psql+DATABASE_URL) — پرسش‌های این بند رد می‌شوند"
fi

q() { # یک پرسش فقط‌خواندنی
  case "$PSQL_MODE" in
    container) t docker exec "$PG" psql -U "$PGUSER_V" -d "$PGDB_V" -X -q -At -F '|' -c "$1" 2>&1 ;;
    host)      t psql "$DATABASE_URL" -X -q -At -F '|' -c "$1" 2>&1 ;;
    *)         return 1 ;;
  esac
}
qt() { # همان، با جدولِ خوانا
  case "$PSQL_MODE" in
    container) t docker exec "$PG" psql -U "$PGUSER_V" -d "$PGDB_V" -X -q -c "$1" 2>&1 ;;
    host)      t psql "$DATABASE_URL" -X -q -c "$1" 2>&1 ;;
    *)         return 1 ;;
  esac
}

if [ "$PSQL_MODE" != 'none' ]; then
  info "نسخهٔ سرور: $(q 'show server_version')"
  info "اندازهٔ پایگاه داده: $(q 'select pg_size_pretty(pg_database_size(current_database()))')"
  info "اتصال‌های باز: $(q 'select count(*) from pg_stat_activity where datname = current_database()') از سقف $(q 'show max_connections')"
  info "زمان سرور: $(q 'select now()')   منطقهٔ زمانی: $(q 'show timezone')"

  sub "مهاجرت‌ها"
  MIG=$(q "select migration_name || '  ' || coalesce(finished_at::text,'ناتمام') from _prisma_migrations order by started_at desc limit 6")
  if printf '%s' "$MIG" | grep -qiE 'does not exist|error'; then
    bad "جدول _prisma_migrations خوانده نشد — این پایگاه داده با prisma مهاجرت نشده است؟"
    printf '%s\n' "$MIG" | raw
  else
    printf '%s\n' "$MIG" | raw
    UNFIN=$(q "select count(*) from _prisma_migrations where finished_at is null")
    [ "${UNFIN:-0}" = 0 ] && ok "هیچ مهاجرت ناتمامی نیست" || bad "$UNFIN مهاجرتِ ناتمام هست — پیش از دیپلوی باید رسیدگی شود"
    LAST=$(q "select migration_name from _prisma_migrations order by started_at desc limit 1")
    info "آخرین مهاجرت: $LAST"
    if [ "$LAST" = '20261105090000_base_data_defaults' ]; then
      ok "آخرین مهاجرت همان انتظار این ارتقاست (سند ۲۲ بند ۱) — این نسخه مهاجرت تازه ندارد"
    else
      warn "آخرین مهاجرت '$LAST' است و نه 20261105090000_base_data_defaults؛ بند ۱ سند ۲۲ را بخوانید"
    fi
  fi
  if [ -n "$APP" ]; then
    sub "prisma migrate status (از داخل کانتینر برنامه)"
    t docker exec "$APP" node node_modules/prisma/build/index.js migrate status --schema apps/api/prisma/schema.prisma 2>&1 | tail -15 | raw
  fi

  sub "حجم داده در جدول‌های کلیدی"
  # شمارشِ واقعی با count(*) و نه `n_live_tup` از pg_stat_user_tables: آن عدد تا
  # اجرای autovacuum/analyze صفر می‌ماند و روی همین ماشین همهٔ جدول‌ها را صفر نشان
  # داد — عددِ غلط در گزارشِ پیش از دیپلوی، بدتر از عددِ نبود.
  qt "select 'financial_documents' as جدول, count(*) as ردیف from financial_documents
      union all select 'invoices', count(*) from invoices
      union all select 'invoice_items', count(*) from invoice_items
      union all select 'invoice_payments', count(*) from invoice_payments
      union all select 'attachments', count(*) from attachments
      union all select 'vendors', count(*) from vendors
      union all select 'users', count(*) from users
      union all select 'sessions', count(*) from sessions
      union all select 'audit_logs', count(*) from audit_logs
      union all select 'export_jobs', count(*) from export_jobs
      union all select 'report_definitions', count(*) from report_definitions
      union all select 'report_versions', count(*) from report_versions
      union all select 'permissions', count(*) from permissions
      union all select 'role_permissions', count(*) from role_permissions
      order by 2 desc" | raw

  sub "ده جدول پرحجم روی دیسک"
  qt "select relname as جدول, pg_size_pretty(pg_total_relation_size(relid)) as حجم
      from pg_catalog.pg_statio_user_tables
      order by pg_total_relation_size(relid) desc limit 10" | raw

  # ── بندهای مخصوص سند ۲۲ ─────────────────────────────────────────────
  sub "بند ۲ و ۲.۵ سند ۲۲ — سه مجوزی که seed می‌آورد"
  for perm in security_settings:write attachment:restore attachment:purge; do
    cnt=$(q "select count(*) from permissions where key = '$perm'")
    roles=$(q "select coalesce(string_agg(r.key, ','), '—') from role_permissions rp join roles r on r.id = rp.role_id join permissions p on p.id = rp.permission_id where p.key = '$perm'")
    if [ "${cnt:-0}" = 0 ]; then
      info "$perm : نیست → با seed ساخته می‌شود (یا راه ب سند)"
    else
      ok "$perm : هست، نقش‌ها: $roles"
    fi
  done

  sub "بند ۳ سند ۲۲ — قالب فعال هر گزارش: سیستمی یا کپیِ کاربر؟"
  qt "select t.key as نوع_گزارش, coalesce(d.name,'—') as قالب_فعال, coalesce(d.is_system::text,'—') as سیستمی
      from report_types t left join report_definitions d on d.id = t.active_definition_id
      order by t.key" | raw
  COPIES=$(q "select count(*) from report_types t join report_definitions d on d.id = t.active_definition_id where d.is_system = false")
  if [ "${COPIES:-0}" = 0 ]; then
    ok "هیچ قالب فعالی کپیِ کاربر نیست — seed همه را به‌روز می‌کند"
  else
    warn "$COPIES گزارش، قالب فعالش کپیِ کاربر است — seed به آن‌ها دست نمی‌زند (تلهٔ بند ۳؛ دستی به‌روز کنید)"
  fi

  sub "بند ۴ سند ۲۲ — فاکتورهای بدون روش پرداخت"
  qt "select d.status as وضعیت_سند, count(*) as فاکتور
      from invoices i
      join financial_documents d on d.id = i.document_id
      left join invoice_payments p on p.invoice_id = i.id
      where p.invoice_id is null
      group by d.status order by 2 desc" | raw
  LOCKED=$(q "select count(*) from invoices i join financial_documents d on d.id = i.document_id left join invoice_payments p on p.invoice_id = i.id where p.invoice_id is null and d.status not in ('DRAFT','REOPENED')")
  NOPAY=$(q "select count(*) from invoices i left join invoice_payments p on p.invoice_id = i.id where p.invoice_id is null")
  info "جمع فاکتورهای بی‌روش‌پرداخت: ${NOPAY:-?}"
  if [ "${LOCKED:-0}" = 0 ]; then
    ok "همهٔ این فاکتورها در اسناد DRAFT/REOPENED هستند — همان حالت بی‌دردسر سند"
  else
    warn "$LOCKED فاکتورِ بی‌روش‌پرداخت در اسنادی هستند که DRAFT/REOPENED نیستند — بند ۴ سند ۲۲ را پیش از دیپلوی بخوانید"
  fi

  sub "بند ۶ و ۷ سند ۲۲ — تنظیم‌های ذخیره‌شده و داده‌های وابسته"
  info "کلیدهای system_settings: $(q "select coalesce(string_agg(key, ', ' order by key),'—') from system_settings")"
  info "report_settings: $(q "select coalesce((select left(value::text,120) from system_settings where key='report_settings'),'<نیست؛ یعنی آستانه خاموش است>')")"
  info "session_policy: $(q "select coalesce((select left(value::text,120) from system_settings where key='session_policy'),'<نیست؛ یعنی از متغیر محیطی می‌آید>')")"
  info "اسناد بدون شمارهٔ گردش (بند ۷ تکهٔ ۵): $(q "select count(*) from financial_documents where deleted_at is null and workflow_number is null")"
  # شمار فصل‌های **فعال** هر گروه = شمار ستون‌های فصل روی فرم ریزهزینه. سقف قالب ۱۰
  # ستون است، پس گروهی با بیش از ۱۰ فصل فعال، روی کاغذ کامل درنمی‌آید.
  info "فصل‌های فعال هر گروه بودجه (= ستون‌های فرم ریزهزینه): $(q "select coalesce(string_agg(x.k || '=' || x.n, ', '), '—') from (select bc.key::text as k, count(*)::text as n from budget_chapters ch join budget_categories bc on bc.id = ch.category_id where ch.is_active = true group by bc.key) x")"

  sub "پیوست‌ها (بند ۸.۶)"
  info "پیوست زنده: $(q 'select count(*) from attachments where deleted_at is null')   حذف‌شده (قابل بازگشت): $(q 'select count(*) from attachments where deleted_at is not null')"
  info "حجم پیوست‌های زنده: $(q "select coalesce(pg_size_pretty(sum(size_bytes)::bigint),'0') from attachments where deleted_at is null")"

  sub "کارهای خروجی مانده (docs/18 §۵)"
  qt "select status as وضعیت, count(*) as تعداد from export_jobs group by status order by 2 desc" 2>/dev/null | raw
  RUNNING=$(q "select count(*) from export_jobs where status = 'RUNNING'" 2>/dev/null)
  [ "${RUNNING:-0}" = 0 ] && ok "هیچ کار خروجی در حال اجرا نمانده" || warn "${RUNNING} کار خروجی در وضعیت RUNNING مانده — نشانهٔ راه‌اندازی مجددِ ناتمام"

  sub "کاربران و نقش‌ها"
  qt "select r.key as نقش, count(ur.user_id) as کاربر
      from roles r left join user_roles ur on ur.role_id = r.id
      group by r.key order by 2 desc" 2>/dev/null | raw
  info "کاربران فعال: $(q 'select count(*) from users where is_active = true' 2>/dev/null)   غیرفعال: $(q 'select count(*) from users where is_active = false' 2>/dev/null)"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "۶. پشتیبان"

BK_DIRS=""
for d in ./backups /opt/document-manager/backups /opt/apps/document-manager/backups \
         /opt/backup /opt/backups /mnt/backup /mnt/backups /var/backups/document-manager \
         "${WDIR:-/nonexistent}/backups" "${BACKUP_DIR:-}"; do
  [ -n "$d" ] && [ -d "$d" ] && BK_DIRS="$BK_DIRS $d"
done

# پشتیبانِ واقعی ممکن است هیچ‌کدام از مسیرهای حدسی بالا را نداشته باشد و با یک
# اسکریپت cron جای دیگری بنویسد — روی سرور واقعی همین‌طور بود و این بند یک FAIL
# دروغ داد («هیچ پوشهٔ پشتیبانی نیست») در حالی که دو کار cron شب‌ها پشتیبان
# می‌گرفتند. پس مسیرها را از خودِ کارهای cron بیرون می‌کشیم.
CRON_LINES=$( { crontab -l 2>/dev/null; cat /etc/crontab 2>/dev/null; cat /etc/cron.d/* 2>/dev/null; } \
              | grep -iE 'backup|dump|document|dm[-_]' | grep -v '^[[:space:]]*#' )
for s in $(printf '%s\n' "$CRON_LINES" | grep -oE '/[^ ]*\.sh' | sort -u); do
  [ -r "$s" ] || continue
  info "اسکریپت پشتیبان در cron: $s"
  # مسیرهای پوشه‌مانندِ داخل اسکریپت. محتوای اسکریپت **چاپ نمی‌شود**: چنین
  # اسکریپتی معمولاً رمز پایگاه داده را در خودش دارد.
  for d in $(grep -ohE '/[A-Za-z0-9._/-]{3,}' "$s" 2>/dev/null \
             | grep -iE 'backup|dump|bak' | sed 's#/[^/]*$##' | sort -u); do
    [ -d "$d" ] && BK_DIRS="$BK_DIRS $d"
  done
done
BK_DIRS=$(printf '%s\n' $BK_DIRS | sort -u | tr '\n' ' ')
if [ -n "$BACKUPC" ]; then
  info "سرویس پشتیبان در داکر: $BACKUPC ($(docker inspect -f '{{.State.Status}}' "$BACKUPC" 2>/dev/null))"
  docker inspect -f '{{range .Mounts}}      {{.Source}} → {{.Destination}}{{printf "\n"}}{{end}}' "$BACKUPC" 2>/dev/null
  MP=$(docker inspect -f '{{range .Mounts}}{{.Source}}{{printf "\n"}}{{end}}' "$BACKUPC" 2>/dev/null | head -1)
  [ -n "${MP:-}" ] && [ -d "$MP" ] && BK_DIRS="$BK_DIRS $MP"
fi

if [ -z "${BK_DIRS// /}" ]; then
  bad "هیچ پوشهٔ پشتیبانی پیدا نشد — پیش از دیپلوی، پشتیبان گرفتن اختیاری نیست (docs/18 §۳)"
else
  for d in $BK_DIRS; do
    sub "پوشهٔ پشتیبان: $d"
    ls -lht "$d" 2>/dev/null | head -8 | raw
    # تازه‌ترین فایل پشتیبان. `find -printf` و `stat -c` فقط در GNU هستند، پس هر دو
    # راهِ جانشین هم دارند — این اسکریپت ممکن است روی busybox یا BSD اجرا شود.
    FP=$(find "$d" -maxdepth 1 -type f \( -name '*.dump' -o -name '*.sql*' -o -name '*.tar*' \) -printf '%T@ %p\n' 2>/dev/null \
          | sort -rn | head -1 | cut -d' ' -f2-)
    if [ -z "$FP" ]; then
      FP=$(ls -1t "$d"/*.dump "$d"/*.sql* "$d"/*.tar* 2>/dev/null | head -1)
    fi
    if [ -z "$FP" ] || [ ! -f "$FP" ]; then
      bad "در $d هیچ فایل پشتیبانی نیست"
    else
      MTIME=$(stat -c %Y "$FP" 2>/dev/null || stat -f %m "$FP" 2>/dev/null)
      SZB=$(stat -c %s "$FP" 2>/dev/null || stat -f %z "$FP" 2>/dev/null || wc -c <"$FP" 2>/dev/null)
      SZ=$(du -h "$FP" 2>/dev/null | cut -f1)
      if [ -n "${MTIME:-}" ]; then
        AGE_H=$(( ( $(date +%s) - MTIME ) / 3600 ))
        info "تازه‌ترین: $FP  (حجم ${SZ:-?}، سن ${AGE_H} ساعت)"
        if [ "$AGE_H" -le 48 ]; then ok "تازه‌ترین پشتیبان کمتر از ۴۸ ساعت سن دارد"
        else bad "تازه‌ترین پشتیبان ${AGE_H} ساعت سن دارد — پیش از دیپلوی یک پشتیبان تازه بگیرید"; fi
      else
        info "تازه‌ترین: $FP  (حجم ${SZ:-?}؛ سنش خوانده نشد)"
      fi
      if [ -n "${SZB:-}" ] && [ "$SZB" -lt 10240 ] 2>/dev/null; then
        bad "فایل پشتیبان مشکوکانه کوچک است (${SZB} بایت) — یک dump سالمِ این سامانه بزرگ‌تر است"
      fi
    fi
    AVAIL=$(df -hP "$d" 2>/dev/null | awk 'NR==2{print $4}')
    info "فضای آزاد روی همان دیسک: ${AVAIL:-?}"
  done
fi

sub "زمان‌بندی"
CR="$CRON_LINES"
if [ -n "$CR" ]; then
  ok "ورودی cron مرتبط پیدا شد:"; printf '%s\n' "$CR" | raw
  # لاگِ همان کارها: آخرین اجرا موفق بوده یا نه. رمزها پوشانده می‌شوند.
  for lg in $(printf '%s\n' "$CR" | grep -oE '/[^ ]*\.log' | sort -u); do
    [ -r "$lg" ] || continue
    AG=$(( ( $(date +%s) - $(stat -c %Y "$lg" 2>/dev/null || date +%s) ) / 3600 ))
    info "لاگ $lg — آخرین نوشته ${AG} ساعت پیش، سه خط آخر:"
    tail -3 "$lg" 2>/dev/null \
      | sed -E 's#(://[^:/@]+):[^@]*@#\1:***@#g; s/((PG)?PASSWORD|SECRET|TOKEN)=[^ ]*/\1=***/gi' \
      | cut -c1-200 | raw
  done
else
  if [ -n "$BACKUPC" ]; then info "cron نیست ولی سرویس پشتیبانِ داکر هست (راه ب سند ۱۸)"
  else warn "نه cron پشتیبان پیدا شد و نه سرویس پشتیبان — پشتیبان دستی، پشتیبانی است که یک روز گرفته نمی‌شود"; fi
fi
if have systemctl; then
  T=$(systemctl list-timers --all 2>/dev/null | grep -iE 'backup|dm-|document')
  [ -n "$T" ] && { info "timer سیستمی:"; printf '%s\n' "$T" | raw; }
fi

sub "ابزار پشتیبان"
if [ -n "$PG" ]; then
  info "pg_dump داخل کانتینر: $(t docker exec "$PG" pg_dump --version 2>/dev/null)"
  ok "راه عملی پشتیبان روی این ماشین: PG_CONTAINER=$PG npm run backup"
elif have pg_dump; then
  info "pg_dump روی میزبان: $(pg_dump --version 2>/dev/null)"
  SRV=$(q 'show server_version' 2>/dev/null)
  info "نسخهٔ سرور: ${SRV:-?} — نسخهٔ pg_dump نباید از سرور کوچک‌تر باشد"
else
  bad "نه pg_dump روی میزبان هست و نه کانتینر postgres — پشتیبان‌گیری همین حالا ممکن نیست"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "۷. فضای ذخیره‌سازی (S3) — فایل‌های پیوست"

if [ -z "$S3C" ]; then
  warn "کانتینر S3 پیدا نشد؛ اگر سرویس بیرونی است، آدرس و دسترسی‌اش را از متغیرهای بند ۴ بگیرید"
else
  info "کانتینر: $S3C   ایمیج: $(docker inspect -f '{{.Config.Image}}' "$S3C" 2>/dev/null)   وضعیت: $(docker inspect -f '{{.State.Status}}' "$S3C" 2>/dev/null)"
  docker port "$S3C" 2>/dev/null | raw
  docker inspect -f '{{range .Mounts}}      {{.Type}}  {{.Source}} → {{.Destination}}{{printf "\n"}}{{end}}' "$S3C" 2>/dev/null
fi
EP=$([ -n "$APP" ] && docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$APP" 2>/dev/null | grep -E '^S3_ENDPOINT=' | cut -d= -f2-)
if [ -n "${EP:-}" ]; then
  # از داخل کانتینر برنامه، نه از میزبان: آدرسی مثل http://s3:8333 یک نام در شبکهٔ
  # داکر است و روی میزبان اصلاً resolve نمی‌شود — آزمونِ میزبان‌محور برایش
  # FAIL دروغ می‌داد، درباره‌ٔ سرویسی که از دید برنامه سالم است.
  S3OUT=$(t docker exec "$APP" node -e "
    fetch('$EP').then(r=>console.log('HTTP '+r.status))
      .catch(e=>{console.log('ERR '+e.message);process.exit(1)})" 2>/dev/null)
  case "${S3OUT:-}" in
    'HTTP 200'|'HTTP 403'|'HTTP 401')
      ok "درگاه S3 ($EP) از دید برنامه جواب می‌دهد ($S3OUT — ۴۰۳ یعنی بالا و احراز هویت فعال)" ;;
    'HTTP '*) warn "درگاه S3 ($EP) پاسخ غیرمنتظره داد: $S3OUT" ;;
    *) bad "درگاه S3 ($EP) از داخل کانتینر برنامه جواب نداد (${S3OUT:-بی‌پاسخ}) — آپلود پیوست کار نمی‌کند" ;;
  esac
fi
if [ "$DO_SIZES" = 1 ] && [ "${DOCKER_OK:-0}" = 1 ]; then
  sub "اندازهٔ volume‌ها (du — کند)"
  for v in $(docker volume ls -q 2>/dev/null); do
    MPV=$(docker volume inspect -f '{{.Mountpoint}}' "$v" 2>/dev/null)
    [ -d "$MPV" ] && printf '      %-40s %s\n' "$v" "$(du -sh "$MPV" 2>/dev/null | cut -f1)"
  done
else
  info "برای اندازهٔ volume‌ها اسکریپت را با --sizes اجرا کنید (du روی دیسک، کند)"
fi
warn "یادآوری همیشگی: فایل‌های S3 در پشتیبان پایگاه داده **نیستند** و جداگانه پشتیبان می‌خواهند (docs/18 §۳)"

# ─────────────────────────────────────────────────────────────────────────────
section "۸. شبکه، پروکسی و TLS"

sub "پورت‌های گوش‌دهنده"
if have ss; then t ss -tlnp 2>/dev/null | head -25 | raw
elif have netstat; then t netstat -tlnp 2>/dev/null | head -25 | raw
else info "نه ss و نه netstat"; fi

if [ "${DOCKER_OK:-0}" = 1 ]; then
  sub "پورت‌هایی که داکر روی همهٔ رابط‌ها منتشر کرده"
  PUB=$(docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null | grep -E '0\.0\.0\.0|\[::\]')
  if [ -n "$PUB" ]; then
    printf '%s\n' "$PUB" | raw
    # معیار، پورتِ **داخلِ** کانتینر است و نه پورت میزبان: نگاشت 15432→5432 هم
    # همان پایگاه داده را به بیرون می‌دهد، با یک عدد بی‌گناه‌تر.
    printf '%s' "$PUB" | grep -qE '0\.0\.0\.0:[0-9]+->5432/' && bad "پورت پایگاه داده روی همهٔ رابط‌ها منتشر شده — از بیرونِ ماشین قابل دسترس است"
    printf '%s' "$PUB" | grep -qE '0\.0\.0\.0:[0-9]+->(9000|9001|8333)/' && warn "پورت ذخیره‌سازی روی همهٔ رابط‌ها منتشر شده"
  else
    ok "پورتی روی همهٔ رابط‌ها منتشر نشده"
  fi
fi

sub "پروکسی و TLS"
if [ -n "$PROXY" ]; then
  info "پروکسی در داکر: $PROXY ($(docker inspect -f '{{.Config.Image}}' "$PROXY" 2>/dev/null))"
elif have systemctl && systemctl is-active --quiet nginx 2>/dev/null; then
  ok "nginx روی میزبان فعال است"
  info "فایل‌های پیکربندی مرتبط:"; grep -rlsiE '3100|document|dm' /etc/nginx 2>/dev/null | head -5 | raw
elif have systemctl && systemctl is-active --quiet caddy 2>/dev/null; then
  ok "caddy روی میزبان فعال است"
else
  warn "پروکسی‌ای پیدا نشد — بدون TLS، کوکی نشست Secure نمی‌شود (docs/18 §۶)"
fi
CERTS=$(find /etc/letsencrypt/live /etc/ssl/certs/dm* /etc/nginx/ssl -name '*.pem' -o -name '*.crt' 2>/dev/null | head -5)
if [ -n "$CERTS" ] && have openssl; then
  for c in $CERTS; do
    END=$(openssl x509 -enddate -noout -in "$c" 2>/dev/null | cut -d= -f2)
    [ -n "$END" ] && info "گواهی $c تا $END"
    openssl x509 -checkend 1209600 -noout -in "$c" >/dev/null 2>&1 || warn "گواهی $c در دو هفتهٔ آینده منقضی می‌شود"
  done
fi

sub "فایروال"
if have ufw && t ufw status 2>/dev/null | head -8 | grep -q .; then t ufw status 2>/dev/null | head -8 | raw
elif have firewall-cmd; then t firewall-cmd --list-all 2>/dev/null | head -12 | raw
elif have iptables; then t iptables -S 2>/dev/null | head -12 | raw
else info "ابزار فایروالی پیدا نشد"; fi

sub "دسترسی به شبکهٔ بیرون (برای docker build و pull)"
if have curl; then
  for host in https://registry-1.docker.io/v2/ https://registry.npmjs.org/; do
    CODE=$(t curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$host" 2>/dev/null)
    case "${CODE:-000}" in
      000) warn "$host در دسترس نیست — اگر ایمیج را همین‌جا می‌سازید، build شکست می‌خورد (ایمیج را جای دیگر بسازید و save/load کنید)" ;;
      *) ok "$host جواب می‌دهد (HTTP $CODE)" ;;
    esac
  done
fi

# ─────────────────────────────────────────────────────────────────────────────
section "۹. کد و نسخه روی این ماشین"

SRC=''
for d in . /opt/document-manager /srv/document-manager "${WDIR:-}"; do
  [ -n "$d" ] && [ -d "$d/.git" ] && { SRC="$d"; break; }
done
if [ -n "$SRC" ] && have git; then
  ok "مخزن روی میزبان: $SRC"
  info "شاخه: $(git -C "$SRC" rev-parse --abbrev-ref HEAD 2>/dev/null)   HEAD: $(git -C "$SRC" rev-parse --short HEAD 2>/dev/null)"
  info "آخرین کامیت: $(git -C "$SRC" log -1 --format='%h %ad %s' --date=short 2>/dev/null | cut -c1-120)"
  DIRTY=$(git -C "$SRC" status --porcelain 2>/dev/null | head -5)
  [ -z "$DIRTY" ] && ok "درخت کاری پاک است" || { warn "درخت کاری دست‌خورده است:"; printf '%s\n' "$DIRTY" | raw; }
  if git -C "$SRC" cat-file -e 2cd0dd7^{commit} 2>/dev/null; then
    AHEAD=$(git -C "$SRC" rev-list --count 2cd0dd7..HEAD 2>/dev/null)
    info "فاصله از 2cd0dd7 (مبنای سند ۲۲): $AHEAD کامیت"
    git -C "$SRC" merge-base --is-ancestor 2cd0dd7 HEAD 2>/dev/null \
      && ok "2cd0dd7 نیای HEAD است — مسیر ارتقا همان سند ۲۲ است" \
      || warn "2cd0dd7 در تاریخ این شاخه نیست؛ کدِ مستقر از جای دیگری آمده"
  else
    warn "کامیت 2cd0dd7 در این مخزن نیست (fetch نشده؟)"
  fi
else
  info "مخزن گیت روی این ماشین پیدا نشد — ایمیج جای دیگری ساخته می‌شود"
fi
if [ -n "$APP" ]; then
  sub "نسخهٔ درونِ ایمیج در حال اجرا"
  t docker exec "$APP" sh -lc 'node -v; cat package.json 2>/dev/null | head -5' 2>/dev/null | raw
fi

# ─────────────────────────────────────────────────────────────────────────────
section "۱۰. خلاصه"

printf '  %sOK%s: %s    %sWARN%s: %s    %sFAIL%s: %s\n' "$C_OK" "$C_RESET" "$N_OK" "$C_WARN" "$C_RESET" "$N_WARN" "$C_BAD" "$C_RESET" "$N_BAD"
if [ "$N_BAD" -gt 0 ]; then
  printf '\n  %sبندهای قرمز — پیش از دیپلوی:%s\n' "$C_BAD" "$C_RESET"
  for l in "${BAD_LIST[@]}"; do printf '    • %s\n' "$l"; done
fi
if [ "$N_WARN" -gt 0 ]; then
  printf '\n  %sبندهای زرد — ببینید و تصمیم بگیرید:%s\n' "$C_WARN" "$C_RESET"
  for l in "${WARN_LIST[@]}"; do printf '    • %s\n' "$l"; done
fi

cat <<'EOF'

  این گزارش چه چیزی را تصمیم می‌گیرد:
    • اینکه سرویس با compose بالا آمده یا با docker run — شکلِ دستور دیپلوی از همین می‌آید
    • اینکه آخرین مهاجرت همان 20261105090000_base_data_defaults است — ادعای «مهاجرت تازه‌ای نیست»
    • اینکه قالب فعال کدام گزارش‌ها کپیِ کاربر است — تلهٔ بند ۳ سند ۲۲
    • اینکه چند فاکتورِ بی‌روش‌پرداخت در سندِ غیر DRAFT هست — بند ۴
    • سن آخرین پشتیبان و جای آزاد دیسک — پشتیبان پیش از دیپلوی اختیاری نیست

  گام بعدی: همین فایل خروجی را بفرستید.
EOF
printf '  خروجی ذخیره شد در: %s\n\n' "$OUT_FILE"

# بستن stdout تا `tee` به EOF برسد و هرچه مانده را روی فایل بنویسد.
#
# اینجا `wait` نمی‌آید: روی git-bash دیده شد که اسکریپت را تا ابد نگه می‌دارد،
# چون منتظر همان جانشینیِ پردازهٔ tee می‌ماند. بستن fd به‌تنهایی کار را می‌کند.
exec 1>&-

# هرگز با خطا تمام نمی‌شود: این یک گزارش است، نه یک دروازه.
exit 0
