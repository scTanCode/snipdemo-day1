# Snip frontend

Angular 19 frontend for the Snip URL shortener. It uses the shared `POST /api/links`
and `GET /api/links` API and links to the returned short URLs.

Run the backend on port 3000, then run `npm install` and `npm start`. Open
http://localhost:4200. The development server proxies `/api` to the backend.
Production builds use the same origin as the page, so the bundled Bun server can
serve both the app and its API.

Run `npm run build` to produce `dist/snip-frontend/browser`. Run
`npm test -- --watch=false --browsers=ChromeHeadless` for the component tests.
