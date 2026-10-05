# Statepack website

Astro builds the page as static HTML. React runs the playground and WebGL artwork.
The playground imports the workspace runtime and executes edited definitions in a
browser worker, with a timeout for long-running operations.

From the repository root:

```sh
bun install
bun run build
bun run website:dev
```

Production build and preview:

```sh
bun run website:build
bun run website:preview
```

## Cloudflare

The static output is `website/dist`. No server adapter is needed.

For a Git-connected Workers build, use the repository root as the build root,
`bun run website:build` as the build command, and
`bun run --cwd website deploy` as the deploy command. Install workspace
dependencies with Bun.

For a direct upload, build first and run `bun run --cwd website deploy`.
Wrangler uses your Cloudflare login; select your account with
`CLOUDFLARE_ACCOUNT_ID` if you have access to several.
