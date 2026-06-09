# Tandem

```
 ✴ ███ ✴
✴   █   ✴  tandem
 ✴  █  ✴
```

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI](https://github.com/jakejimenez/tandem/actions/workflows/release.yml/badge.svg)](https://github.com/jakejimenez/tandem/actions)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/jakejimenez/tandem/pulls)

**Bring your AI coding agent to your team.** Run Claude Code, OpenCode, Pi, or Codex on your machine and share it live in Slack or Mattermost. Colleagues can watch, collaborate, and run their own sessions — all from chat.

> _Screen-sharing for AI pair programming, but everyone can type._

## Features

- **Multi-harness** — supports Claude Code, OpenCode, Pi, and Codex CLI. Switch with `!harness <type>` or set a per-user default with `!harness use <type>`
- **Real-time streaming** — agent responses stream live into the chat thread as they're generated
- **Multi-platform** — connect to multiple Slack and Mattermost workspaces simultaneously
- **Concurrent sessions** — each thread gets its own isolated agent session, persisted across bot restarts
- **Permission modes** — three-way control over tool use: `default` (every action prompts for 👍/✅/👎), `auto` (classifier auto-approves low-risk; high-risk still prompts — recommended), or `bypass` (no prompts). Set via config, CLI flag, or `!permissions default|auto|bypass` in-session
- **Plan approval** — when the agent presents a plan, react 👍 to start or 👎 to request changes (Claude Code)
- **Multiple choice** — react 1️⃣ 2️⃣ 3️⃣ 4️⃣ to answer agent questions (Claude Code)
- **Sticky to-do lists** — agent task lists update live at the bottom of each thread (Claude Code)
- **Collaboration** — `!invite @user` to let teammates participate; they get added as `Co-Authored-By:` trailers on commits
- **File attachments** — drop images, PDFs, archives, or source files into the chat; agent reads them from disk (100 MB cap)
- **Files back to chat** — agent posts screenshots, PDFs, plots, and audio directly into the thread via the `send_file` tool
- **Permalink following** — paste a Slack or Mattermost link; the agent resolves it to the post body via `read_post`
- **Git worktrees** — isolate agent changes in a branch with `!worktree <branch>`
- **Multi-User Channel Mode** — each user who mentions `@tandem` gets their own private thread with their own agent session; no output leaks between users
- **Concurrency queue** — when at capacity, incoming requests queue in FIFO order rather than being dropped, with configurable timeout and per-user limits
- **Admin commands** — `!admin sessions`, `!admin kill`, `!admin queue`, `!admin capacity` for ops oversight
- **Multi-account / multi-key** — round-robin across multiple API keys with automatic rate-limit cooldown
- **Chrome automation** — optional Claude Code + Chrome integration for web tasks
- **Auto-update** — bot checks for new versions and offers to restart; `!update now` / `!update defer` controls timing
- **Single binary** — ships as a self-contained executable (`bun build --compile`); no separate runtime to install on target machines

## Supported Harnesses

| Harness | Install | Interactive approval | Plan approval | Sticky todos |
|---|---|:---:|:---:|:---:|
| **Claude Code** | `npm i -g @anthropic-ai/claude-code` | ✅ | ✅ | ✅ |
| **OpenCode** | `npm i -g opencode-ai` | ✅ | — | — |
| **Pi** | `npm i -g @earendil-works/pi-coding-agent` | — | — | — |
| **Codex CLI** | `npm i -g @openai/codex` | — (sandbox) | — | — |

## Supported Platforms

| Platform | Status |
|---|---|
| **Slack** | ✅ |
| **Mattermost** | ✅ |
| Discord | Roadmap |
| Teams | Roadmap |

## Quick Start

```bash
curl -fsSL https://raw.githubusercontent.com/jakejimenez/tandem/main/install.sh | bash
cd /your/project
tandem
```

The **interactive setup wizard** guides you through:

1. Detecting installed harnesses and picking your default
2. Configuring your Slack or Mattermost bot credentials
3. Setting a permission mode
4. Testing and saving the configuration

**Prerequisites:** at least one harness CLI installed and working (e.g. `claude --version`).

See [SETUP_GUIDE.md](SETUP_GUIDE.md) for step-by-step Slack and Mattermost bot creation.

### Use

Mention the bot in any channel:

```
@tandem fix the bug in src/auth.ts
```

Tandem starts a session in a thread, streams the agent's work live, and waits for your reactions.

## Session Commands

Type `!help` in any session thread:

| Command | Description |
|:---|:---|
| `!help` | Show available commands |
| `!release-notes` | Show what changed in the running version |
| `!context` | Show context window usage |
| `!cost` | Show token usage and cost |
| `!compact` | Compress context to free up space (Claude Code) |
| `!cd <path>` | Change working directory (restarts agent) |
| `!permissions <mode>` | Set permission mode: `default` / `auto` / `bypass` |
| `!mentions [on\|off]` | Quiet mode: only respond when @mentioned |
| `!worktree <branch>` | Create and switch to a git worktree (also: `list`, `switch`, `remove`, `cleanup`, `off`) |
| `!plugin <list\|install\|uninstall> [name]` | Manage Claude Code plugins |
| `!harness <type\|list>` | Switch harness (starts a new session) or list detected harnesses |
| `!harness use <type>` | Set your personal default harness |
| `!invite @user` | Invite a user to this session (added as `Co-Authored-By:` on commits) |
| `!kick @user` | Remove an invited user |
| `!github-email <email>` | Register your GitHub noreply email for commit attribution |
| `!update` | Show auto-update status (`!update now` / `!update defer`) |
| `!bug <desc>` | Report a bug with context |
| `!approve` | Approve a pending plan (alternative to 👍 reaction) |
| `!escape` | Interrupt the current task (session stays active) |
| `!stop` | Stop this session |
| `!kill` | Emergency shutdown (kills all sessions and exits the bot) |

### Multi-User / Admin Commands

| Command | Description |
|:---|:---|
| `@tandem sessions` | List your active sessions |
| `!admin sessions` | List all active sessions (admin only) |
| `!admin kill <threadId>` | Kill a specific session (admin only) |
| `!admin queue` | Show the current wait queue (admin only) |
| `!admin capacity` | Show active/max sessions (admin only) |

## Interactive Controls

**Permission approval** — when the agent wants to use a tool:
- 👍 Allow this action
- ✅ Allow all future actions this session
- 👎 Deny

**Plan approval** — when the agent presents a plan (Claude Code):
- 👍 Approve and start
- 👎 Request changes

**Multiple choice** — react 1️⃣ 2️⃣ 3️⃣ 4️⃣ to answer agent questions (Claude Code)

**Session control** — ⏸️ interrupt · ❌ or 🛑 stop · ↩️ resume a timed-out session

## Multi-User Channel Mode

Each user who mentions `@tandem` gets their own thread and their own isolated agent session. No one else's output appears in your thread unless you share it.

When the server is at capacity, requests queue in FIFO order rather than being rejected. Admins can configure `maxConcurrent` and `maxPerUser` per channel, and use `!admin` commands to monitor and manage sessions.

## File Attachments

Drop any file into the thread — image, PDF, archive, source file, log. The bot saves it to a per-thread directory and prepends the path to your message so the agent can read it. Full multimodal support for images and PDFs (100 MB cap). Archives are extracted by the agent itself.

Going the other way, agents post files back into the thread (screenshots, generated PDFs, plots, audio) by calling the `send_file` tool.

## Collaboration

```
!invite @colleague    # Let them participate
!kick @colleague      # Remove access
```

Invited collaborators are added as `Co-Authored-By:` trailers on any commits the agent makes. Each collaborator runs `!github-email <their-noreply-address>` once and the bot remembers it across sessions.

## Git Worktrees

Keep your main branch clean while the agent works:

```
@tandem on branch feature/add-auth implement user authentication
```

Or mid-session: `!worktree feature/add-auth`

## Access Control

Restrict who can start sessions during setup, or reconfigure with `tandem --setup`. Leave the allowed-users list empty to let anyone in the channel use the bot.

Channel-level config supports per-channel harness allowlists, permission modes, concurrency limits, and admin lists.

## Documentation

- **[Setup Guide](SETUP_GUIDE.md)** — Slack and Mattermost bot creation
- **[Configuration Reference](docs/CONFIGURATION.md)** — full config schema
- **[AGENTS.md](AGENTS.md)** — architecture guide for contributors and AI agents

## Updates

```bash
bun install -g tandem   # or: npm install -g tandem
```

The bot checks for updates automatically and notifies you when a new version is available.

## License

Apache-2.0 — see [LICENSE](LICENSE).

