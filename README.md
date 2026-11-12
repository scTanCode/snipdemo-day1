# Snip

Snip is a URL shortener with one Bun backend and two clients: an Angular web app
and a Node CLI. Links are stored in memory and disappear when the server restarts.

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| POST | `/api/links` | `{ "url": "https://example.com" }` | 201 `{ code, url, shortUrl, hits, createdAt }`, or 400 `{ error }` |
| GET | `/api/links` | - | 200 array of links |
| GET | `/:code` | - | 302 redirect and increment hits, or 404 |

This repository uses separate orphan branches for each layer. The `main` branch
pins those branches as submodules; `bundle` is generated release output.

```sh
git clone --recurse-submodules https://github.com/scTanCode/snipdemo-day1.git
cd snipdemo-day1
```

In separate terminals, run `cd backend && bun start`, `cd frontend && npm install
&& npm start`, and `cd cli && node cli.js ls`. The web UI is at
`http://localhost:4200`; the API is at `http://localhost:3000`.

To update a layer, commit and push in its submodule, then run
`git submodule update --remote <path>` in the superproject and commit the updated
gitlink on `main`. Clone with `--recurse-submodules` or initialize submodules
with `git submodule update --init --recursive`.
