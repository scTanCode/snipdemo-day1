# Snip CLI

A zero-dependency Node.js command-line client for the Snip URL shortener. It
requires Node.js 20 or newer for the built-in `fetch` API.

## Usage

```text
node cli.js add https://example.com
node cli.js ls
node cli.js open abc123
node cli.js help
```

Set `SNIP_API` to change the API base URL; it defaults to
`http://localhost:3000`. The `snip`, `snip.cmd`, and `snip.ps1` wrappers invoke
`cli.js` from their own directory.

Run the mock-API tests with `npm test`.
