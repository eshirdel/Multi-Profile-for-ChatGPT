#!/bin/bash
# Install or update Multi Profile for ChatGPT.
# Copyright 2026 Ebrahim Shirdel. Licensed under the Apache License, Version 2.0.
#
#   curl -fsSL https://github.com/eshirdel/Multi-Profile-for-ChatGPT/releases/latest/download/install.sh | bash
#   ./install.sh --local .        # install from a checkout (for development)
#
# The release tarball is verified against its published SHA-256 before anything is installed.

set -euo pipefail

REPO="eshirdel/Multi-Profile-for-ChatGPT"
ASSET="multi-profile-for-chatgpt.tar.gz"
PREFIX="${MPFC_PREFIX:-$HOME/.local/share/multi-profile-for-chatgpt}"

die()  { printf 'error: %s\n' "$*" >&2; exit 1; }
info() { printf '%s\n' "$*"; }

[ "$(uname -s)" = "Darwin" ] || die "Multi Profile for ChatGPT only runs on macOS"

install_from_dir() {
  local src="$1" version dest runtime tmpdest
  [ -f "$src/VERSION" ] && [ -x "$src/bin/chatgpt-profiles" ] || die "$src does not look like a release"
  version="$(tr -d '[:space:]' < "$src/VERSION")"
  case "$version" in ''|*[!0-9.]*) die "bad VERSION in $src" ;; esac
  dest="$PREFIX/versions/$version"

  mkdir -p "$PREFIX/versions"
  if [ -e "$dest" ]; then
    dest="$PREFIX/versions/$version-$(date +%Y%m%d-%H%M%S)-$$"
  fi
  tmpdest="$(mktemp -d "$PREFIX/versions/.install-$version.XXXXXX")"
  # Only what is needed at runtime.
  cp -R "$src/bin" "$src/lib" "$src/VERSION" "$src/LICENSE" "$src/NOTICE" "$src/README.md" "$src/install.sh" "$tmpdest/"
  mv "$tmpdest" "$dest"

  ln -sfn "$dest" "$PREFIX/current"

  # The CLI is an internal runtime dependency only. Do not install a public
  # command into ~/.local/bin; the Profile Manager calls this stable runtime path.
  runtime="$PREFIX/current/bin/chatgpt-profiles"

  # Install/refresh the Profile Manager launcher, but never launch ChatGPT or
  # touch any existing ChatGPT login/history during installation.
  if [ -d "${CHATGPT_APP:-/Applications/ChatGPT.app}" ]; then
    MPFC_RUNTIME_BIN="$runtime" "$runtime" manager-install >/dev/null \
      || info "Manager launcher could not be built; reinstall the app runtime"
  fi

  # Rebuild generated profile launchers into the current per-profile app layout.
  # Existing profile data and older launchers are preserved.
  "$runtime" rebuild >/dev/null 2>&1 || true

  info "Installed Multi Profile for ChatGPT $version"
  info "Profile Manager: $HOME/Applications/ChatGPT Profiles.app"
  info "No public CLI command was installed."
}

install_latest() {
  local tmp base expected actual
  tmp="$(mktemp -d)"
  base="https://github.com/$REPO/releases/latest/download"
  info "Downloading the latest release..."
  curl -fsSL "$base/$ASSET" -o "$tmp/$ASSET" || die "download failed"
  curl -fsSL "$base/$ASSET.sha256" -o "$tmp/$ASSET.sha256" || die "checksum download failed"
  expected="$(awk '{print $1}' "$tmp/$ASSET.sha256")"
  actual="$(shasum -a 256 "$tmp/$ASSET" | awk '{print $1}')"
  [ -n "$expected" ] && [ "$expected" = "$actual" ] || die "checksum mismatch, refusing to install"
  mkdir -p "$tmp/x"
  tar -xzf "$tmp/$ASSET" -C "$tmp/x"
  install_from_dir "$tmp/x/multi-profile-for-chatgpt"
  rm -rf "$tmp"
}

case "${1:-}" in
  --local) [ -n "${2:-}" ] || die "usage: install.sh --local DIR"; install_from_dir "$(cd "$2" && pwd)" ;;
  "")      install_latest ;;
  *)       die "usage: install.sh [--local DIR]" ;;
esac