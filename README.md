# Multi Profile for ChatGPT

Run several fully separate copies of the official ChatGPT desktop app on
macOS, side by side: one per account or workspace, each with its own login,
chats, projects, and settings, and its own easy-to-spot icon.

> **Unofficial project.** Multi Profile for ChatGPT is not affiliated with,
> endorsed by, or sponsored by OpenAI. It does not ship, modify, or
> redistribute the ChatGPT app. It only starts the app that is already
> installed on your Mac, in a separate profile.

## Why

The ChatGPT desktop app (including Codex) keeps one login and one set of
chats per macOS user. If you have more than one account, or a personal and a
work workspace, you normally have to log out and back in to switch, and your
local projects and chats get mixed together.

With this tool you get, for example:

| Launcher | Use it for |
|---|---|
| ChatGPT Personal | your own account, personal workspace |
| ChatGPT Company | the same account, company workspace |
| ChatGPT Pro | a second account |

Each one can be open at the same time as the others.

## How it works

The ChatGPT app supports separate instances through two environment
variables, which it also uses itself when it opens a new instance:

- `CODEX_HOME`: where Codex keeps chats, projects, memories, and login
- `CODEX_ELECTRON_USER_DATA_PATH`: where the desktop app keeps its own state

For every profile, Multi Profile for ChatGPT:

1. creates a private Codex home, `~/.codex-<profile>`
2. creates a private app data folder,
   `~/Library/Application Support/ChatGPT-<Profile>`
3. builds a small launcher app, `~/Applications/ChatGPT <Profile>.app`, that
   starts the official `/Applications/ChatGPT.app` with those two folders
4. draws the launcher icon from the icon of your installed ChatGPT app, with a
   colored badge on top, so each profile is easy to tell apart

Nothing inside `/Applications/ChatGPT.app` is changed, so its code signature
stays intact and its own updater keeps working.

## Updates

- **ChatGPT itself** updates through its official built-in updater. Every
  profile uses the same installed app, so all profiles get the new version at
  once.
- **This tool** updates from the releases of this repository (see below).

## Requirements

- macOS
- The official ChatGPT desktop app installed in `/Applications/ChatGPT.app`

No other dependencies: everything uses tools that ship with macOS.

## Install

```bash
curl -fsSL https://github.com/eshirdel/Multi-Profile-for-ChatGPT/releases/latest/download/install.sh | bash
```

The installer downloads the latest release, checks its SHA-256 checksum, and
installs it to `~/.local/share/multi-profile-for-chatgpt`, with the
`chatgpt-profiles` command linked in `~/.local/bin`. If that folder is not on
your `PATH`, the installer prints the line to add.

Prefer to read before you run? Download `install.sh` from the
[latest release](https://github.com/eshirdel/Multi-Profile-for-ChatGPT/releases/latest),
look at it, then run `bash install.sh`. From a clone, `./install.sh --local .`
installs the checked-out version.

## Update

```bash
chatgpt-profiles update          # install the newest release, then refresh launchers
chatgpt-profiles update --check  # only tell me if there is one
```

Updates are verified the same way as the install. Profile data is never
touched. ChatGPT itself keeps updating through its own built-in updater.

## Uninstall

```bash
chatgpt-profiles remove <Name>            # per profile; add --purge to also trash its data
rm -rf ~/.local/share/multi-profile-for-chatgpt ~/.local/bin/chatgpt-profiles
rm -rf ~/.config/multi-profile-for-chatgpt
```

## Usage

Run it without arguments and answer the questions; press Enter to accept a
default:

```text
$ chatgpt-profiles
How many profiles do you want to create [1]: 3

Profile 1 name (e.g. Personal, Work): Personal
Badge text, 1-3 characters [P]:
Badge color (green slate orange purple red teal pink amber or #RRGGBB) [green]:
...
About to create:
  ChatGPT Personal             badge P   #16A34A
  ChatGPT Company              badge C   #1F2937
  ChatGPT Pro                  badge PRO #EA580C
Continue? [Y/n]:
```

Then open **ChatGPT Personal**, **ChatGPT Company**, and so on from
`~/Applications`, Spotlight, or Launchpad, and sign in once in each.

Other commands:

| Command | What it does |
|---|---|
| `chatgpt-profiles create --name Work --label W --color purple` | create one profile without questions |
| `chatgpt-profiles list` | show profiles and where their data lives |
| `chatgpt-profiles open Work` | start a profile from the terminal |
| `chatgpt-profiles rebuild [NAME]` | rebuild launchers and icons (for example after ChatGPT changes its icon); data is kept |
| `chatgpt-profiles remove Work` | remove the launcher, keep the data |
| `chatgpt-profiles remove Work --purge` | also move the profile's data to the Trash (asks you to type the name) |

Creating a profile with a name that already exists only rebuilds its launcher;
existing chats and logins are never touched.

### Where data lives

| What | Path |
|---|---|
| Codex chats, projects, memories, login | `~/.codex-<name>` |
| Desktop app state | `~/Library/Application Support/ChatGPT-<Name>` |
| Launcher | `~/Applications/ChatGPT <Name>.app` |
| Profile settings (name, badge) | `~/.config/multi-profile-for-chatgpt/profiles/` |

Your original ChatGPT (`~/.codex`) is not touched and keeps working as before.

### Good to know

- **One login per profile.** Don't copy one profile's login files into another
  profile or another computer. The login token is renewed regularly, and two
  copies of it can sign each other out.
- **The Dock shows the ChatGPT icon** for every running profile, because they
  are all the same app. The colored badge is on the launchers; drag them to the
  Dock to start the right profile.
- Some workspaces (for example business workspaces with local Codex disabled by
  an admin) do not show local projects. That is a workspace setting, not this
  tool.

## Contributing

Issues and pull requests are welcome. Please keep the tool dependency-free
(only what ships with macOS) and compatible with the macOS system bash 3.2.
CI runs `shellcheck` and a full create/list/rebuild/remove cycle on macOS for
every pull request.

### Releasing

1. Update `VERSION` (for example `0.2.0`) and commit.
2. Tag and push: `git tag v0.2.0 && git push origin v0.2.0`.

The release workflow checks that the tag matches `VERSION`, then publishes the
tarball, its SHA-256, and `install.sh`. Existing installs pick it up with
`chatgpt-profiles update`.

## License

Apache License 2.0. You are welcome to use, change, and contribute. If you
redistribute this project or a derivative of it, you must keep the
[`NOTICE`](NOTICE) file and the copyright line, as the license requires.
