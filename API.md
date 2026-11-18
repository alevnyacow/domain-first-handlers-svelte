# API Reference

Technical specification of the public API of `@domain-first/handlers-svelte`.

- [Package](#package)
- [Exports overview](#exports-overview)
- [Adapter](#adapter)
    - [`svelteAdapter`](#svelteadapter)
    - [Request reading](#request-reading)
    - [Response writing](#response-writing)
- [Functions](#functions)
    - [`svelteEndpoints`](#svelteendpoints)
- [Runtime semantics](#runtime-semantics)
    - [Route matching](#route-matching)

Notation used below:

- **Endpoint** is a function built with `createEndpoint()(svelteAdapter)` from [`@domain-first/handlers-rest`](https://www.npmjs.com/package/@domain-first/handlers-rest). It has the signature `(event: RequestEvent) => Promise<Response>` with `RequestEvent` from `@sveltejs/kit` and carries its `metadata` (method and path) and `_api_schemas`.
- **Route path** is `metadata.route.path`, for example `["users", ":userId"]`. Segments prefixed with `:` are **path parameters**; all other segments are **static**.
- **Request path** is the value SvelteKit passes to a rest parameter route as `params.path`, split by `/`.

## Package

| Property     | Value                                                         |
| ------------ | ------------------------------------------------------------- |
| Name         | `@domain-first/handlers-svelte`                               |
| Entry point  | `.` (single entry, no subpath exports)                        |
| Formats      | ESM (`dist/index.js`), CommonJS (`dist/index.cjs`)            |
| Types        | `dist/index.d.ts`                                             |
| Dependencies | None                                                          |
| Peer         | `@sveltejs/kit` `>=2 <4` (types only, nothing is imported at runtime) |
| Types used   | `RequestEvent`, `RequestHandler` from your installed `@sveltejs/kit` |
| Works with   | `@domain-first/handlers-rest` (its `Adapter` type)            |
| Syntax       | ES syntax supported by Node.js 22                             |

## Exports overview

| Export               | Kind     | Section                                       |
| -------------------- | -------- | --------------------------------------------- |
| `svelteAdapter`      | constant | [`svelteAdapter`](#svelteadapter)             |
| `svelteEndpoints`    | function | [`svelteEndpoints`](#svelteendpoints)         |

Nothing else is part of the public API.

## Adapter

### `svelteAdapter`

Adapter for `@domain-first/handlers-rest` that turns endpoints into SvelteKit request handlers.

**Signature**

```ts
const svelteAdapter: Adapter<[event: RequestEvent], Response>;
```

**Behavior**

- Endpoints built with it accept the `RequestEvent` SvelteKit passes to a request handler, so they can be exported from `+server.ts` as `GET`, `POST`, … directly. Their type is SvelteKit's own: they are assignable to `RequestHandler` from `@sveltejs/kit` and to the route-specific `RequestHandler` from generated `./$types`.
- Implements every `Adapter` member, including the optional `input.pathParams`, so routes with path parameters are supported.
- A plain object, not a factory: it has no configuration.

**Example**

```ts
import { createEndpoint } from "@domain-first/handlers-rest";
import { svelteAdapter } from "@domain-first/handlers-svelte";

const svelteEndpoint = createEndpoint()(svelteAdapter);

// src/routes/api/sum/+server.ts
export const POST = svelteEndpoint(sum, { route: { method: "post", path: ["sum"] } })
    .input((schema) => ({ body: schema }))
    .mapInput(({ body }) => body);
```

### Request reading

How each request part is obtained from `event: RequestEvent`. When a part is read at all is decided by `@domain-first/handlers-rest`.

| Part       | Source                             | Result                                                                                  |
| ---------- | ---------------------------------- | --------------------------------------------------------------------------------------- |
| `query`    | `event.url.searchParams`           | `Record<string, string>`. For a repeated key the last value wins.                       |
| `params`   | `event.params`                     | The object SvelteKit resolved, or `{}` when it is missing.                              |
| `body`     | `event.request.json()`             | Parsed JSON.                                                                            |
| `formData` | `event.request.formData()`         | A `FormData` instance.                                                                  |
| `headers`  | `event.request.headers`            | `Record<string, string>`. Names are lowercase; repeated headers are joined with `", "`. |
| `cookies`  | `event.cookies.getAll()`           | `Record<string, string>` of cookie names to values. For a repeated name the last wins.  |

**Throws**

| Error                        | When                                                                  |
| ---------------------------- | --------------------------------------------------------------------- |
| Whatever `json()` throws     | A body schema is declared and the body is empty or not valid JSON.    |
| Whatever `formData()` throws | A form data schema is declared and the body is not form data.         |

How these errors become a response is decided by `@domain-first/handlers-rest`.

A missing path parameter (for example, an endpoint with `:userId` exported from a folder without `[userId]`) is not an adapter error: path parameter validation in `@domain-first/handlers-rest` fails.

### Response writing

How the result of an endpoint becomes a response.

**On success**

1. If the result has `cookies`, every entry is set with `event.cookies.set(name, value, options)`. SvelteKit adds the `set-cookie` headers to the response. See [Cookies](#cookies).
2. Returns a `Response` with:

| Part      | Value                                                                                    |
| --------- | ---------------------------------------------------------------------------------------- |
| Status    | `statusCode` (the endpoint's success status code)                                        |
| Body      | `JSON.stringify(body)`. Empty when `body` is `undefined`.                                |
| Headers   | `Content-Type: application/json`, then the result's `headers`. A `Content-Type` header in the result overrides the default. |

**On failure**

Returns a `Response` with status `statusCode`, body `JSON.stringify(error)` and `Content-Type: application/json`. Cookies and headers are not written.

#### Cookies

| Cookie options from the second argument of `.output()` (`{ cookies: { [name]: … } }`) | Options passed to `event.cookies.set()` |
| ------------------------------------------------- | --------------------------------------- |
| Present                                           | `{ path: "/", maxAge, httpOnly }`       |
| Absent                                            | `{ path: "/" }`                         |

- `path` is always `"/"`: SvelteKit 2 requires it.
- Other options keep SvelteKit defaults: `secure` (`true` except on `http://localhost`) and `sameSite: "lax"`. Note that SvelteKit's default for `httpOnly` is `true`, so a cookie without options is HTTP-only.

## Functions

### `svelteEndpoints`

Combines endpoints into one rest parameter request handler.

**Signature**

```ts
function svelteEndpoints(
    routes: Array<Endpoint>
): RequestHandler;
```

`Endpoint` is any endpoint built with `@domain-first/handlers-rest`: a function with `metadata` and `_api_schemas`. It is not exported as a named type.

**Parameters**

| Name     | Type              | Description                                                               |
| -------- | ----------------- | ------------------------------------------------------------------------- |
| `routes` | `Array<Endpoint>` | Endpoints to dispatch to. Order does not affect matching except for ties. |

**Returns**

A SvelteKit `RequestHandler` for a rest parameter named `path`: `src/routes/<prefix>/[...path]/+server.ts`. Export it under every HTTP method the endpoints use.

**Behavior**

1. Reads `event.params.path` and splits it by `/`. An empty string (the prefix itself was requested) is the empty request path `[]`.
2. Selects the endpoint by method and path. See [Route matching](#route-matching).
3. No endpoint matches: returns a `Response` with status `404` and an empty body.
4. Otherwise calls the endpoint with `{ ...event, params: pathParams }`, and returns its response.

- Route paths are relative to the rest parameter folder: for `src/routes/api/[...path]/+server.ts`, `GET /api/users/42` has the request path `["users", "42"]` and matches `["users", ":userId"]`, not `["api", "users", ":userId"]`.
- `routes` is read on every request: the array is not copied or pre-processed.

**Throws**

| Error                        | When                                                                  |
| ---------------------------- | --------------------------------------------------------------------- |
| `TypeError`                  | `event.params.path` is `undefined`: the rest parameter is not named `path`. |
| Whatever the endpoint throws | The matched endpoint rejects.                                         |

**Example**

```ts
// src/routes/api/[...path]/+server.ts
import { svelteEndpoints } from "@domain-first/handlers-svelte";
import type { RequestHandler } from "./$types";

const handler: RequestHandler = svelteEndpoints([getUser, getMe, createUser]);

export const GET = handler;
export const POST = handler;
```

## Runtime semantics

| Topic                       | Behavior                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Direct export               | An endpoint is a request handler. Folder names of dynamic segments must equal the parameter names of the route path.      |
| Route path in direct export | Not matched against the URL: SvelteKit routing decides which file runs. The route path only names parameters and feeds OpenAPI. |
| Rest parameter dispatch     | [`svelteEndpoints`](#svelteendpoints) matches method and route path itself. SvelteKit only supplies the rest of the path. |
| Unknown route               | `404` with an empty body. A known path with another method is also `404`, not `405`.                                      |
| `HEAD`, `OPTIONS`           | Not derived from `GET` by `svelteEndpoints`: they match only endpoints declared with that method. |
| Response type               | Always a plain `Response` with a JSON content type.                                                                       |

### Route matching

[`svelteEndpoints`](#svelteendpoints) selects an endpoint with these rules:

| Step          | Rule                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Method        | `metadata.route.method` equals `event.request.method`, case-insensitively.                                                        |
| Segments      | Route path segments are split by `/`: `["users", "tabs/:tab"]` is the same as `["users", "tabs", ":tab"]`.                         |
| Length        | The route path and the request path have the same number of segments. There are no optional or wildcard parameters.              |
| Static        | A static segment equals the request segment exactly (case-sensitive).                                                            |
| Parameter     | A `:name` segment matches any request segment; its value is stored under `name`. If a name repeats, the last value wins.          |
| Specificity   | Among matches, at the first segment where two route paths differ in kind, the static one wins. Array order does not matter.      |
| Ties          | Route paths with the same kinds at every position (e.g. two identical paths): the earlier one in `routes` wins.                   |

**Example**

| Request path               | Routes                                           | Selected              |
| -------------------------- | ------------------------------------------------ | --------------------- |
| `["users", "me"]`          | `["users", ":userId"]`, `["users", "me"]`        | `["users", "me"]`     |
| `["users", "42"]`          | `["users", ":userId"]`, `["users", "me"]`        | `["users", ":userId"]` |
| `["users", "42", "posts"]` | `["users", ":userId", ":tab"]`, `["users", ":userId", "posts"]` | `["users", ":userId", "posts"]` |
| `["posts", "42"]`          | `["users", ":userId"]`                           | None: `404`           |
