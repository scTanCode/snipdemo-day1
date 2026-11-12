# Snip backend

A zero-dependency Bun API for creating and listing short links and redirecting
short codes. Links are held in memory and are cleared when the server restarts.

## Run

Install [Bun](https://bun.sh/), then run:

```sh
bun start
```

The server listens on port `3000` by default. Set `PORT` to change it, `BASE_URL`
to set the origin used in returned short links, or `RAILWAY_PUBLIC_DOMAIN` to use
that domain over HTTPS when `BASE_URL` is unset. `PUBLIC_DIR` optionally enables
static-file serving from a directory; `/` serves its `index.html`.

## API

- `POST /api/links` with `{"url":"https://example.com"}` creates a link.
- `GET /api/links` returns all links.
- `GET /:code` redirects to the original URL and increments its hit count.
