# API Docs Swagger UI — Design

Date: 2026-07-28
Status: Approved

## Goal

Render the existing `api-docs.json` as interactive Swagger UI at a public route in the Next.js app. Anyone with the URL can browse the API reference in a browser.

## Non-Goals

- No auth/RBAC on the docs page.
- No request validation or schema hardening.
- No replacement of the underlying `api-docs.json` format.
- No API endpoints other than the existing ones.

## Stack

- Next.js 14 App Router (existing).
- `swagger-ui-react` for the UI component, client-only via `next/dynamic` with `ssr: false`.
- TypeScript converter module: `lib/api-docs-to-openapi.ts`.
- Spec source: existing `api-docs.json` at repo root (custom format, not OpenAPI).

## Route

- Path: `/api-docs`
- File: `app/api-docs/page.tsx` (Server Component shell).
- Client child: `app/api-docs/SwaggerClient.tsx` (renders `swagger-ui-react` with converted spec).
- Public. No middleware checks. Visible in production.

## Converter Contract

`lib/api-docs-to-openapi.ts` exports:

```ts
export function toOpenApi(doc: ApiDocs): OpenApi3
```

Input shape (subset of `api-docs.json`):

```ts
type ApiDocs = {
  title: string
  version: string
  baseUrl: string
  description?: string
  routes: Route[]
}

type Route = {
  path: string                    // e.g. "/api/ping"
  methods: string[]               // ["POST", "PATCH"]
  auth?: string                   // freeform description
  description?: string
  query?: Record<string, string>  // key -> human description
  schemas?: {
    postRequest?: Record<string, string>
    patchRequest?: Record<string, string>
    getRequest?: Record<string, string>
    deleteRequest?: Record<string, string>
    putRequest?: Record<string, string>
  }
  responses?: Record<string, string>  // "200" -> description
  sideEffects?: string[]
}
```

Output: valid OpenAPI 3.0 document with:

- `openapi: "3.0.3"`
- `info.{title, version, description}` from input.
- `servers: [{ url: baseUrl }]`.
- `paths`: keyed by `route.path`. Each entry has one sub-key per method (lowercased), containing:
  - `summary`: first line of `description` or `path`.
  - `description`: full description + sideEffects joined by newline.
  - `parameters`: from `query`, typed as `string` query params with `description` preserved.
  - `requestBody`: for POST/PATCH/PUT/DELETE if matching `schemas.<method>Request` exists. Build an `application/json` body with `type: object`, `properties` keys from the schema map (each value `type: string` unless description indicates otherwise), `required: []`.
  - `responses`: keys from `responses`, default `description` to the response text, `content` omitted (text-only descriptions).

Unrecognized keys in `route` are ignored. Missing fields are skipped without error.

## Page Component Behavior

- Server shell loads `api-docs.json` from disk (Node `fs.readFile` at request time is fine; or import via `import docs from "@/../api-docs.json"` — pick import to avoid I/O on every render).
- Pass converted spec to client child as prop.
- Client child mounts `<SwaggerUI spec={spec} />` inside a container.
- Set Swagger UI `docExpansion: "list"`, `defaultModelsExpandDepth: -1` for compactness.
- Page metadata: `<title>` from `info.title`.

## Files to Add

- `app/api-docs/page.tsx`
- `app/api-docs/SwaggerClient.tsx`
- `lib/api-docs-to-openapi.ts`

## Files to Modify

- `package.json` — add `swagger-ui-react` (and `@types/swagger-ui-react` dev dep) to dependencies.
- `next.config.mjs` — no change required (CSS import handled in client component via `swagger-ui-react/swagger-ui.css`).

## Error Handling

- If `api-docs.json` is malformed JSON, page renders error boundary message: "API spec unavailable".
- If converter throws on an unknown route shape, log to server console and skip that route (don't fail whole page).
- Swagger UI itself handles missing/invalid spec with an inline error.

## Testing

- Manual: `npm run dev`, navigate to `http://localhost:3000/api-docs`.
- Verify:
  - Page loads without runtime errors in browser console.
  - All routes from `api-docs.json` appear under their paths.
  - Each method expands to show description, parameters, request body, responses.
  - Public access (no redirect to login).
- Build sanity: `npm run build` succeeds; `/api-docs` appears in build output as a static page.

## Out of Scope (Future)

- Auto-generate spec from `app/api/**/route.ts` Zod schemas.
- Server-side security scheme (Bearer / cookie) entries.
- Try-it-out proxy to live API.
- Versioning multiple specs.
