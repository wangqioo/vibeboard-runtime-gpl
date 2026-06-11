#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="${ROOT}/tmp/upstream-import"

rm -rf "${TMP_DIR}"
mkdir -p "${TMP_DIR}" "${ROOT}/upstream"

download_and_unpack() {
  local repo="$1"
  local out_name="$2"
  local tarball="${TMP_DIR}/${out_name}.tar.gz"

  curl -L "https://codeload.github.com/${repo}/tar.gz/refs/heads/main" -o "${tarball}"
  rm -rf "${ROOT}/upstream/${out_name}"
  mkdir -p "${TMP_DIR}/${out_name}"
  tar -xzf "${tarball}" -C "${TMP_DIR}/${out_name}" --strip-components=1
  mv "${TMP_DIR}/${out_name}" "${ROOT}/upstream/${out_name}"
}

download_and_unpack "clocteck/holocubic-apps" "holocubic-apps"
download_and_unpack "clocteck/holocubic-nes-esp32" "holocubic-nes-esp32"

rm -rf "${TMP_DIR}"
echo "Imported upstream snapshots into ${ROOT}/upstream"
