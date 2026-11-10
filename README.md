# Multi Profile for ChatGPT

Run multiple fully isolated copies of the official ChatGPT desktop app on macOS, with a native profile picker inspired by Chrome Profiles.

> **Unofficial project.** Not affiliated with, endorsed by, or sponsored by OpenAI. It does not modify or redistribute the ChatGPT app.

## What v0.2 adds

Opening **ChatGPT Profiles** shows a native profile manager instead of immediately creating or opening multiple instances.

The manager always shows:

- **Original** — your existing ChatGPT installation, login, chats and local state. This profile is never copied, migrated or modified by the tool.
- Existing isolated profiles.
- **New Instance** — creates exactly one new isolated profile.

New Instance includes presets for:

- Company
- Work
- Personal
- Client
- Third Party
- Testing
- Sandbox
- Temporary
- Custom

Each preset can be renamed and given its own data root, accent color, custom logo, or optional text badge.

## Isolation model

Every new profile gets one dedicated root:

```text
<root>/
  codex/      # CODEX_HOME
  electron/   # Electron user-data
```

The launcher starts the official `/Applications/ChatGPT.app` with:

- `CODEX_HOME=<root>/codex`
- `CODEX_ELECTRON_USER_DATA_PATH=<root>/electron`
- `--user-data-dir=<root>/electron`

A root cannot be reused by another profile.

The original ChatGPT profile is not moved into this layout. Choosing **Original** simply opens the normal ChatGPT app.

## Profile icons

The base icon is always the icon from your installed ChatGPT app.

A small profile mark is overlaid in the lower-right corner:

| Preset | Overlay |
|---|---|
| Company | briefcase |
| Work | work/tool symbol |
| Personal | person |
| Client | people |
| Third Party | link |
| Testing | tools |
| Sandbox | cube |
| Temporary | clock |
| Custom | star or your custom image |

The built-in marks use macOS SF Symbols. No icon assets are downloaded.

You may instead choose a local `.icns`, `.png`, `.jpg`, `.jpeg`, or `.tiff` file. A private copy is stored in the tool configuration so moving the source image later does not break the launcher.

A 1–3 character text badge can also be used.

## Safety around existing data

Creating or installing this tool does **not**:

- log out the existing ChatGPT app
- delete or migrate `~/.codex`
- delete or migrate existing ChatGPT Application Support data
- copy the Original login into another profile
- launch multiple profiles automatically

Rebuilding a generated launcher only replaces that launcher. Its profile data root is kept.

Changing the root of an existing profile is refused automatically instead of silently making the profile appear empty.

`remove NAME` removes the generated launcher/config but keeps profile data.

`remove NAME --purge` requires typing the profile name and then moves only that isolated profile's data to the Trash.

## Requirements

- macOS
- Official ChatGPT desktop app installed at `/Applications/ChatGPT.app`

No third-party runtime dependencies are required.

## Install

```bash
curl -fsSL https://github.com/eshirdel/Multi-Profile-for-ChatGPT/releases/latest/download/install.sh | bash
```

The installer verifies the release tarball SHA-256 and installs:

- runtime under `~/.local/share/multi-profile-for-chatgpt`
- `chatgpt-profiles` under `~/.local/bin`
- **ChatGPT Profiles.app** under `~/Applications`

The installer builds the profile manager launcher but does not open ChatGPT or alter existing ChatGPT login/history.

For a reviewed checkout:

```bash
./install.sh --local .
```

## Use

Open **ChatGPT Profiles** from `~/Applications`, Spotlight, or Launchpad.

Or run:

```bash
chatgpt-profiles
```

Both open the profile manager.

### Create one profile from the command line

```bash
chatgpt-profiles create \
  --name Company \
  --preset company \
  --root "$HOME/ChatGPT-Profiles/company"
```

Optional flags:

```text
--icon FILE
--label TEXT
--color COLOR
--open
```

Creating a profile creates exactly one instance. It does not create the preset list as actual profiles.

### Other commands

```bash
chatgpt-profiles list
chatgpt-profiles open Company
chatgpt-profiles rebuild Company
chatgpt-profiles rebuild
chatgpt-profiles remove Company
chatgpt-profiles remove Company --purge
chatgpt-profiles manager-install
chatgpt-profiles update --check
chatgpt-profiles update
```

## Existing v0.1 profiles

v0.1 profiles used legacy paths such as `~/.codex-<profile>` and `~/Library/Application Support/ChatGPT-<Profile>`.

v0.2 continues to read and rebuild those profiles without moving their data. It does not automatically migrate them to a new root.

## Updates

ChatGPT itself continues to update through the official ChatGPT updater.

This tool updates from GitHub releases. Updates refresh generated launchers but do not move profile data.

## Development and CI

CI runs:

- ShellCheck
- install on macOS
- native manager launcher build and code-sign verification
- multiple isolated profile creation
- root-collision rejection
- reserved Original protection
- launcher rebuild
- non-destructive remove behavior
- JXA manager load test

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).