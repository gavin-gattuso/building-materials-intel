# Git hooks

Local-only pre-commit gate. Runs `bun run test:reliability` before every commit that touches `.ts` or `.js` files; blocks the commit if tests fail.

## Install (once per clone)

```bash
git config core.hooksPath .githooks
```

## Bypass for a single commit (use sparingly)

```bash
git commit --no-verify
```

## Why not Husky?

Husky requires a package install + `prepare` script in package.json. This setup is one config command and lives in git. Catches the same regressions (`bun run test:reliability` runs in ~500ms) with zero added dependencies.

GitHub Actions (`.github/workflows/test.yml`) runs the same test set on every push and PR as a network-level backstop.
