# Connect OpenPresence V2

The implemented transports are local stdio and stateless Streamable HTTP with OAuth or an explicit bearer grant. The first real Muse read-only connection, skill retrieval, workspace reads and growth-plan call passed on 2026-10-01. Full compatibility still requires the fresh-chat, write, wake and cancellation gates in `docs/openpresence-v2-plan.md`; see the implementation QA record for exact evidence.

## Local clients

From the repository, configure an isolated store and workspace:

For a first local trial on Node 22 or newer, run `pnpm v2:setup`. It creates a
private, git-ignored `.env.v2.local` containing an isolated database path and a
random seven-day connection key. `pnpm v2:http` and `pnpm v2:cli` load that file.
The setup command preserves existing configuration and never prints the key.
Manual environment configuration remains supported:

```sh
export OPENPRESENCE_V2_DB_PATH=/absolute/private/path/social.sqlite
export OPENPRESENCE_V2_TENANT=my-workspace
pnpm v2:cli get_social_workspace '{}'
pnpm v2:cli tools
```

For an MCP client, configure the command as `node`, arguments as the absolute paths to `node_modules/tsx/dist/cli.mjs` and `scripts/v2-mcp.ts`, and working directory as this repository. Set the same two environment variables in the client's server configuration. Using `pnpm v2:mcp` directly can put pnpm's banners on stdout; the direct Node command preserves clean MCP protocol output.

## Dedicated HTTP endpoint

Run the dedicated V2 process when using a development tunnel. A tunnel to the full Next application would expose additional legacy routes. The dedicated server serves only the MCP endpoint, OAuth routes, and authorization metadata.

Configure these environment variables securely in the operator's environment:

| Variable | Value |
| --- | --- |
| `OPENPRESENCE_V2_DB_PATH` | Absolute path to an isolated social database |
| `OPENPRESENCE_V2_DATA_DIR` | Private directory for the separate OAuth database |
| `OPENPRESENCE_V2_GRANTS` | JSON array of `{ "token": "<random secret of at least 32 characters>", "tenantId": "my-workspace", "scopes": ["social:read", "social:write"] }` |
| `OPENPRESENCE_V2_PORT` | Optional local port, default `8789` |
| `OPENPRESENCE_V2_PUBLIC_URL` | Deliberately configured public HTTPS origin, for example `https://your-test-host.example` |
| `OPENPRESENCE_V2_ALLOWED_ORIGINS` | Optional comma-separated exact browser origins when a verified client sends an Origin header; no wildcard support |

Generate the connection key with a cryptographic random generator. Keep it out of source control, chat transcripts, screenshots, and logs. Grants can include `expiresAt` as an ISO timestamp. Removing a configured grant invalidates its OAuth tokens on subsequent requests. Changing its tenant invalidates earlier tokens; reducing scopes takes effect immediately.

```sh
pnpm v2:http
```

The server binds to `127.0.0.1` by default. Establish a deliberate HTTPS tunnel to this port or deploy the dedicated process in a controlled environment. OpenPresence does not create or deploy a tunnel automatically. The public MCP URL is `<PUBLIC_ORIGIN>/api/v2/mcp`. Remote clients cannot use the local loopback URL. TLS termination and infrastructure abuse protection remain deployment responsibilities.

OAuth metadata is available at `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource/api/v2/mcp`. The server supports public-client dynamic registration, authorization code with S256 PKCE, one-hour access tokens, rotating refresh tokens, and revocation. The browser consent form asks the operator for the configured connection key, selects the corresponding workspace, and grants only permitted scopes. The agent does not receive that key. This initial operator-mediated onboarding is intended for controlled connection trials; it is not a general customer identity system.

An explicit bearer client can instead send `Authorization: Bearer <connection key>`. This is an implemented fallback, not a claim that Muse supports that configuration.

## Normal user conversation

The product connection prompt is agent-neutral and asks the host to retrieve the
latest skill and keep ordinary conversation friendly, nontechnical and one
question at a time. The agent translates tool data into useful social guidance;
request markers, scopes, revisions and JSON stay in diagnostics unless asked for.
After an actual connection check, acknowledge connection and continue toward the
user's goal. Use already supplied context. Do not recite five onboarding fields.

A host that saved an earlier skill must refresh it to receive updated guidance.
A user can say: “Use OpenPresence to help me build an audience. Keep it simple
and conversational, and ask me one question at a time.” This is not permission to
access a social account or publish. Existing technical test transcripts are not
rewritten and are not the intended customer conversation.

## Developer-only Muse connection test

Use a dedicated synthetic workspace without account access. Start with read-only discovery if the client permits it. Provide Muse the public URL, not the connection key:

> Connect a custom connector named OpenPresence to `<PUBLIC_ORIGIN>/api/v2/mcp` using OAuth. Send me the browser sign-in link if needed. Retrieve `openpresence://skills/social-growth` and use it for social audience-growth work. Keep scheduling, approvals, account connections, and public execution in Muse. Call `get_social_workspace` and show its returned verification marker. Do not publish or contact anyone.

Enter the connection key only in the OpenPresence consent page after checking its origin. Match Muse's returned `requestMarker` to the isolated database's `v2_calls.id`, and verify a fresh `verificationMarker`. Then execute the ten-step acceptance runbook. Connector creation alone is insufficient: confirm voice durability in a fresh chat, native task references, actual background tool calls, cancellation, reconnect, grant revocation, and failures.

Use a dedicated test account for any real-account pilot. Do not connect or act through a main personal account. Keep the initial synthetic trial entirely separate from real social accounts. During any later real-account pilot, show the account identity and proposed action, then obtain explicit user confirmation for **every public action** before execution, including posts, replies, reactions, and follows. Connecting OpenPresence or setting a growth objective does not approve those actions. Scheduling approval does not approve later public execution. Public execution remains with Muse's existing tools and approval controls; OpenPresence records reported receipts and does not publish.

## Verification

```sh
pnpm exec vitest run tests/v2-auth.test.ts tests/v2-mcp.test.ts tests/v2-process.test.ts tests/v2-boundaries.test.ts tests/v2-oauth-browser.test.ts
```

These checks exercise OAuth grants, PKCE/replay protection, refresh rotation and revocation; a real Chromium browser consent flow; a real SDK client against the HTTP transport and domain services; actual stdio and dedicated HTTP processes; source, channel and experiment boundaries; and actual MCP image blocks. Browser verification found and corrected a consent-origin failure that API-only tests missed. They do not certify Muse's OAuth behavior, background execution, or social growth.
