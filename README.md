# Homepage

A personal homepage/website built with Go.

## Prerequisites

- Go 1.26 or later

## Quick Start

To run the server locally:

```sh
go run ./cmd/server
```

The server listens on port `8282` by default. Set the `PORT` environment variable to use a different port:

```sh
PORT=3000 go run ./cmd/server
```

Then visit `http://localhost:8282/` in your browser.

## Routes

- `/` — home page
- `/belttune` — belt tune page
- `/privacy` — privacy policy
- `/static/` — static assets (CSS, JS, images)

## Project Structure

- `cmd/server/` — Server binary entry point
- `internal/handlers/` — HTTP handler logic
- `web/static/` — Static files (CSS, JS, images)
- `web/templates/` — HTML templates

## Build & Development

Build the binary:
```sh
go build ./...
```

Format code:
```sh
gofmt -w .
```

Run linter:
```sh
go vet ./...
```

## License

MIT
