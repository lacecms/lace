#!/bin/sh
set -eu

# Nginx virtual hosts use bare DNS names, with no port or DNS root dot.
dns_name() {
  printf '%s\n' "$1" | tr '[:upper:]' '[:lower:]' |
    sed -nE 's/^([a-z0-9][a-z0-9.-]*[a-z0-9]|[a-z0-9])\.?$/\1/p'
}

url_hostname() {
  case "$1" in
    http://*|https://*)
      authority=${1#*://}
      authority=${authority%%[/?#]*}
      case "$authority" in
        *'@'*) return ;;
      esac
      dns_name "${authority%%:*}"
      ;;
  esac
}

cms=$(url_hostname "${LACE_PUBLIC_BASE_URL:-}")
site=$(url_hostname "${LACE_BUILD_SITE_URL:-}")
origin=$(url_hostname "${LACE_PREVIEW_ORIGIN:-}")
configured=$(dns_name "${LACE_PREVIEW_HOST:-}")

LACE_PREVIEW_HOSTNAMES=
for hostname in "$origin" "$configured"; do
  if [ -n "$hostname" ] && [ "$hostname" != "$cms" ] && [ "$hostname" != "$site" ]; then
    case " $LACE_PREVIEW_HOSTNAMES " in
      *" $hostname "*) ;;
      *) LACE_PREVIEW_HOSTNAMES="${LACE_PREVIEW_HOSTNAMES:+$LACE_PREVIEW_HOSTNAMES }$hostname" ;;
    esac
  fi
done
export LACE_PREVIEW_HOSTNAMES="${LACE_PREVIEW_HOSTNAMES:-lace-preview-disabled.invalid}"

exec /docker-entrypoint.sh "$@"
