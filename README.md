# Domain First Handlers (SvelteKit)

<p>
    <img src="https://img.shields.io/npm/v/%40domain-first%2Fhandlers-svelte" alt="version">
    <img src="https://img.shields.io/badge/TypeScript-ready-3178C6?logo=typescript&logoColor=white?style=for-the-badge" alt="TypeScript ready">
    <img src="https://img.shields.io/badge/semantic--release-angular-e10079?logo=semantic-release" alt="semver">
    <img src="https://img.shields.io/npm/l/%40domain-first%2Fhandlers-svelte" alt="license">
</p>

Domain handlers as SvelteKit `+server.ts` request handlers.

## What is it?

[`@domain-first/handlers-rest`](https://www.npmjs.com/package/@domain-first/handlers-rest) describes how HTTP reaches your business logic: which request parts to validate and how to map them to a handler. It doesn't know about any framework: an adapter connects it to one.

Domain First Handlers (SvelteKit) is **the adapter for SvelteKit server routes**. Endpoints built with it have SvelteKit's own `RequestHandler` type: export them from `+server.ts` directly, or put them all behind one rest parameter route with `svelteEndpoints`, which matches methods and paths, path parameters included.

```
npm i @domain-first/handlers-svelte @domain-first/handlers-rest
```

## API

The full technical specification lives in [API.md](./API.md).

## Guide

### How to create endpoints

Pass `svelteAdapter` to the endpoint generator.

```ts
import { createEndpoint } from "@domain-first/handlers-rest";
import { svelteAdapter } from "@domain-first/handlers-svelte";

const svelteEndpoint = createEndpoint()(svelteAdapter);
```

Export an endpoint from `+server.ts` under its method. Folder names of dynamic segments must equal the parameter names of the route path.

```ts
// src/routes/api/users/[userId]/+server.ts
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = svelteEndpoint(findUser, {
    route: { method: "get", path: ["users", ":userId"] }
})
    .input(() => ({}))
    .mapInput(({ params }) => ({ id: params.userId }));
```

### How to serve all endpoints from one route

Create a rest parameter route named `[...path]` and pass the endpoints to `svelteEndpoints`. Route paths are relative to the rest parameter folder.

```ts
// src/routes/api/[...path]/+server.ts
import { svelteEndpoints } from "@domain-first/handlers-svelte";

const handler = svelteEndpoints([findUser, findMe, createUser]);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
```

Unknown routes get `404`. Static segments always take priority over parameters, regardless of the order of endpoints: `/api/users/me` goes to `["users", "me"]`, not to `["users", ":userId"]`.

## License

MIT
