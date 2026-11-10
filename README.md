# Multi Profile for ChatGPT

Run multiple isolated profiles of the official ChatGPT desktop app on macOS, with a native profile picker inspired by Chrome Profiles.

> **Unofficial project.** Not affiliated with, endorsed by, or sponsored by OpenAI. It does not modify or redistribute the ChatGPT app.

## Profile Manager

Opening **ChatGPT Profiles** shows:

- **Original** — the existing ChatGPT app, login, chats and local state, untouched.
- Existing isolated profiles.
- **New Instance** — creates exactly one new isolated profile.

The six presets are:

- **Personal** — your own profile. It can sign into the same ChatGPT account as Company while using a different ChatGPT workspace.
- **Company** — your company workspace. It can share the same account identity as Personal but remains a separate local desktop profile.
- **Friend** — a separate profile for a friend's ChatGPT account.
- **Client** — a client-specific account or workspace.
- **Third Party** — a partner, vendor, contractor or external organization.
- **Sandbox** — an isolated disposable profile for testing or temporary use.

Every preset can be renamed and given its own root, accent color, custom logo, or optional text badge.

## Isolation model

The isolation design follows the same core model used by the
`community-profile-isolation` feature in
`ilysenko/codex-desktop-linux`: pin all desktop and Codex state paths together,
pin the Codex executable path, and fail closed when a profile receives conflicting
state.

Each new profile gets:

```text
<root>/
  codex/                  # CODEX_HOME
  electron/               # Electron user-data
  runtime/
    codex-wrapper.sh      # profile-pinned Codex CLI wrapper
    launch-profile.sh     # profile-pinned desktop launcher
```

The profile launcher pins all four values together:

- `CODEX_HOME=<root>/codex`
- `CODEX_ELECTRON_USER_DATA_PATH=<root>/electron`
- `--user-data-dir=<root>/electron`
- `CODEX_CLI_PATH=<root>/runtime/codex-wrapper.sh`

The Codex wrapper then executes the official bundled binary from:

```text
/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex
```

It also restores that bundled Codex directory to the front of `PATH` and pins the
same PATH through `shell_environment_policy.set.PATH`.

### Fail-closed behavior

A profile refuses to run its Codex wrapper when any of these point at another
profile:

- `CODEX_HOME`
- `CODEX_ELECTRON_USER_DATA_PATH`
- `CODEX_CLI_PATH`

A data root also cannot be assigned to two profiles.

This is intentionally stricter than simply launching ChatGPT with a different
`--user-data-dir`.

## Per-profile app endpoints

Every isolated profile has a stable, addressable macOS app path:

```text
~/Applications/ChatGPT Profiles/<slug>/ChatGPT <Name>.app
```

Examples:

```text
~/Applications/ChatGPT Profiles/personal/ChatGPT Personal.app
~/Applications/ChatGPT Profiles/company/ChatGPT Company.app
~/Applications/ChatGPT Profiles/friend/ChatGPT Friend.app
```

Each profile directory also contains a machine-readable `profile.json` with:

- profile name and slug
- preset
- exact app path
- profile root
- `CODEX_HOME`
- Electron user-data path
- profile launcher bundle identifier

This is the preferred integration point for Cloud, automation, scripts, or any tool that must target one specific ChatGPT profile without guessing which session to open.

The generated launcher app has its own filename, display name, bundle identifier and icon. The signed OpenAI ChatGPT process it starts remains the official `com.openai.codex` app, so the actual running Dock/menu-bar identity is still constrained by the official bundle signature.

## Account vs workspace

Local isolation and ChatGPT account/workspace selection are separate concepts.

For example, **Personal** and **Company** may both sign into the same ChatGPT
account. Inside ChatGPT you can select the appropriate Personal or Company
workspace for each profile. Because each desktop profile keeps its own Electron
and Codex state, their local sessions, settings and runtime state do not share the
same profile directory.

The tool does not automate or bypass ChatGPT authentication or workspace access.

## Profile icons

The base icon is always the icon from the installed ChatGPT app. A small mark is
overlaid in the lower-right corner:

| Preset | Overlay |
|---|---|
| Personal | person |
| Company | briefcase |
| Friend | heart |
| Client | people |
| Third Party | link |
| Sandbox | cube |

The built-in marks use macOS SF Symbols; no icon assets are downloaded.

You can also choose a local `.icns`, `.png`, `.jpg`, `.jpeg`, or `.tiff`
file, or use a 1–3 character text badge.

## Notification identity on macOS

Each generated profile launcher has its own bundle identifier and visual identity, but the actual ChatGPT process is still the official signed OpenAI app.

On the current macOS build, the official ChatGPT bundle is signed as `com.openai.codex` with OpenAI-owned production notification entitlements and application groups. That means profile data, sessions, Codex state, CLI path, launcher identity and icons can be isolated safely, while macOS system notification delivery may still be grouped under the official ChatGPT identity.

This project deliberately does **not** clone, rewrite and ad-hoc re-sign the 1.9 GB ChatGPT.app to fake separate push-notification identities. Doing that would invalidate OpenAI's signed push/application-group entitlements and could break login, native helpers or notifications themselves.

If OpenAI exposes a supported per-profile notification identity or signed multi-bundle mechanism in the future, this project can adopt it without weakening the current isolation model.

## Safety around existing data

Installing or creating profiles does **not**:

- log out the existing ChatGPT app
- delete or migrate `~/.codex`
- delete or migrate existing ChatGPT Application Support data
- copy the Original login into another profile
- automatically launch multiple profiles

**Original** simply opens `/Applications/ChatGPT.app`.

Changing the root of an existing isolated profile is refused instead of silently
moving or hiding its data.

`remove NAME` removes only the generated launcher/config and keeps profile data.
`remove NAME --purge` requires typing the profile name and moves only that
isolated profile's data to the Trash.

## Install

Requirements:

- macOS
- Official ChatGPT desktop app installed at `/Applications/ChatGPT.app`

Install from a release:

```bash
curl -fsSL https://github.com/eshirdel/Multi-Profile-for-ChatGPT/releases/latest/download/install.sh | bash
```

The installer puts the internal runtime under:

```text
~/.local/share/multi-profile-for-chatgpt
```

and installs:

```text
~/Applications/ChatGPT Profiles.app
```

### No public CLI installation

The normal installer **does not install `chatgpt-profiles` into
`~/.local/bin` and does not add anything to PATH**.

The shell script remains an internal runtime used by the Profile Manager. This
keeps the desktop installation self-contained while still allowing automation
and CI to invoke the internal runtime when necessary.

For development from a checkout:

```bash
./install.sh --local .
```

## Use

Open **ChatGPT Profiles** from `~/Applications`, Spotlight or Launchpad.

Choose an existing profile, or **New Instance**, select a preset, customize its
name/root/icon if desired, and create it.

Creating an instance creates exactly one profile; the six presets are choices,
not six automatically created profiles.

## Existing v0.1 profiles

v0.1 profiles used legacy locations such as `~/.codex-<profile>` and
`~/Library/Application Support/ChatGPT-<Profile>`.

They remain readable and rebuildable without automatic migration or deletion.

## Development and CI

CI verifies:

- ShellCheck
- app-first installation with no public CLI symlink
- native Profile Manager launcher and code-signing
- all six presets
- separate Codex/Electron roots
- dedicated `CODEX_CLI_PATH` wrappers
- fail-closed rejection of mismatched Codex home, Electron data and CLI path
- duplicate-root rejection
- Original protection
- non-destructive remove behavior

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).