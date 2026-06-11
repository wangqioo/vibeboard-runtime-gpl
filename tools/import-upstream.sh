#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM_DIR="${ROOT}/upstream"
TMP_PARENT="${ROOT}/tmp"
mkdir -p "${TMP_PARENT}"
TMP_DIR="$(mktemp -d "${TMP_PARENT}/upstream-import.XXXXXX")"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

mkdir -p "${UPSTREAM_DIR}"

download_and_unpack() {
  local repo="$1"
  local out_name="$2"
  local tarball="${TMP_DIR}/${out_name}.tar.gz"
  local staged="${TMP_DIR}/${out_name}"
  local target="${UPSTREAM_DIR}/${out_name}"
  local backup="${TMP_DIR}/${out_name}.previous"

  case "${out_name}" in
    */* | .* | "")
      echo "Refusing unsafe upstream output name: ${out_name}" >&2
      exit 1
      ;;
  esac

  curl --fail --location "https://codeload.github.com/${repo}/tar.gz/refs/heads/main" -o "${tarball}"
  mkdir -p "${staged}"
  tar -xzf "${tarball}" -C "${staged}" --strip-components=1

  if [[ ! -s "${staged}/README.md" ]]; then
    echo "Extraction validation failed for ${repo}: README.md missing" >&2
    exit 1
  fi

  if [[ -e "${target}" ]]; then
    mv "${target}" "${backup}"
  fi

  if ! mv "${staged}" "${target}"; then
    if [[ -e "${backup}" ]]; then
      mv "${backup}" "${target}"
    fi
    exit 1
  fi
}

download_and_unpack "clocteck/holocubic-apps" "holocubic-apps"
download_and_unpack "clocteck/holocubic-nes-esp32" "holocubic-nes-esp32"

echo "Imported upstream snapshots into ${UPSTREAM_DIR}"
