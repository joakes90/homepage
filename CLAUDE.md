# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

This is a very early-stage Go personal homepage/website project (module `github.com/joakes90/homepage`). Currently there is a single entry point at `cmd/server/main.go` with no tests, no build tooling, and no CI configured. `internal/handlers/`, `web/static/`, and `web/templates/layout/` exist as empty scaffold directories for planned code — don't assume they contain conventions to follow yet.

## Commands

- Run the server: `go run ./cmd/server` (listens on `:80` — requires privileges to bind that port, or run with elevated permissions)
- Build: `go build ./...`
- Format: `gofmt -l .` / `gofmt -w .`
- Vet: `go vet ./...`
- Test: `go test ./...` (no tests exist yet)

Go toolchain in use: go1.26.4.

## Architecture

- `cmd/server/main.go` is the sole binary entry point. It registers a root handler that writes a static welcome string, and mounts `web/static/` as a file server under `/static/`.
- `web/templates/home.html` is an HTML template that is not yet wired up to any handler — the root route currently returns a hardcoded string rather than rendering this template.
- `internal/handlers/` is intended to hold HTTP handler logic split out of `main.go` as the project grows, per Go convention (`internal/` restricts import access to this module).
