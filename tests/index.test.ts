import { defineHandler } from '@domain-first/handlers';
import { createEndpoint } from '@domain-first/handlers-rest';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { expect, test } from '@rstest/core';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { svelteAdapter, svelteEndpoints } from '../src';

const anySchema = <T>(): StandardSchemaV1<T, T> => ({
    '~standard': {
        version: 1,
        vendor: 'test',
        validate: (value) => ({ value: value as T })
    }
});

const echo = defineHandler({
    inputSchema: anySchema<object>(),
    outputSchema: anySchema<object>(),
    handler: async (input) => input
});

const endpoint = createEndpoint()(svelteAdapter);

const getUser = endpoint(echo, {
    route: { method: 'get', path: ['users', ':userId'] }
})
    .input(() => ({}))
    .mapInput(({ params }) => ({ userId: params.userId }));

const getUserTab = endpoint(echo, {
    route: { method: 'get', path: ['users', ':userId', 'tabs/:tab'] }
})
    .input(() => ({}))
    .mapInput(({ params }) => params);

const getMe = endpoint(echo, {
    route: { method: 'get', path: ['users', 'me'] }
})
    .input(() => ({}))
    .mapInput(() => ({ me: true }));

const getUserPosts = endpoint(echo, {
    route: { method: 'get', path: ['users', ':userId', 'posts'] }
})
    .input(() => ({}))
    .mapInput(({ params }) => ({ posts: params.userId }));

const login = endpoint(echo, {
    route: { method: 'post', path: ['login'] }
})
    .input(() => ({ query: anySchema<Record<string, string>>() }))
    .mapInput(({ query }) => query)
    .output(
        () => ({
            body: anySchema<object>(),
            cookies: anySchema<Record<string, string>>()
        }),
        { cookies: { session: { httpOnly: true, maxAge: 60 } } }
    )
    .mapOutput((result) => ({
        body: result,
        cookies: { session: 'abc', theme: 'dark' }
    }));

test('endpoints are SvelteKit request handlers', () => {
    // Same shapes as `RequestHandler` from generated `./$types`.
    const direct: RequestHandler<{ userId: string }, '/api/users/[userId]'> =
        getUser;
    const restRoute: RequestHandler<{ path: string }, '/api/[...path]'> =
        svelteEndpoints([getUser]);
    const plain: RequestHandler[] = [getUser, svelteEndpoints([getUser])];

    expect([direct, restRoute, ...plain]).toHaveLength(4);
});

type SetCookie = [string, string, object | undefined];

const event = (
    path: string,
    params: Record<string, string> = {},
    method = 'GET'
) => {
    const url = new URL(path, 'http://localhost');
    const setCookies: SetCookie[] = [];
    const svelteEvent = {
        request: new Request(url, { method }),
        url,
        params,
        cookies: {
            getAll: () => [],
            set: (name: string, value: string, opts?: object) => {
                setCookies.push([name, value, opts]);
            }
        }
    } as unknown as RequestEvent;
    return { event: svelteEvent, setCookies };
};

test('request handler reads path parameters from SvelteKit event', async () => {
    const response = await getUser(
        event('/api/users/42', { userId: '42' }).event
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: '42' });
});

test('missing path parameter is a request parsing error', async () => {
    const response = await getUser(event('/api/users/42').event);

    expect(response.status).not.toBe(200);
});

test('cookies are set through event.cookies', async () => {
    const { event: loginEvent, setCookies } = event(
        '/api/login?name=john',
        {},
        'POST'
    );
    const response = await login(loginEvent);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: 'john' });
    expect(setCookies).toEqual([
        ['session', 'abc', { path: '/', maxAge: 60, httpOnly: true }],
        ['theme', 'dark', { path: '/' }]
    ]);
});

test('svelteEndpoints extracts path parameters', async () => {
    const handler = svelteEndpoints([getUser, getUserTab]);

    const user = await handler(
        event('/api/users/42', { path: 'users/42' }).event
    );
    expect(await user.json()).toEqual({ userId: '42' });

    const tab = await handler(
        event('/api/users/42/tabs/posts', { path: 'users/42/tabs/posts' })
            .event
    );
    expect(await tab.json()).toEqual({ userId: '42', tab: 'posts' });
});

test('svelteEndpoints returns 404 for unknown routes', async () => {
    const handler = svelteEndpoints([getUser, getUserTab]);

    const response = await handler(
        event('/api/posts/42', { path: 'posts/42' }).event
    );
    expect(response.status).toBe(404);

    const root = await handler(event('/api', { path: '' }).event);
    expect(root.status).toBe(404);

    const post = await handler(
        event('/api/users/42', { path: 'users/42' }, 'POST').event
    );
    expect(post.status).toBe(404);
});

test('svelteEndpoints requires a rest parameter named path', async () => {
    const handler = svelteEndpoints([getUser]);

    await expect(
        handler(event('/api/users/42', { rest: 'users/42' }).event)
    ).rejects.toThrow(TypeError);
});

test('svelteEndpoints prefers static segments over parameters', async () => {
    for (const routes of [
        [getUser, getUserTab, getMe, getUserPosts],
        [getUserPosts, getMe, getUserTab, getUser]
    ]) {
        const handler = svelteEndpoints(routes);
        const call = async (path: string) =>
            (await handler(event(`/api/${path}`, { path }).event)).json();

        expect(await call('users/me')).toEqual({ me: true });
        expect(await call('users/42')).toEqual({ userId: '42' });
        expect(await call('users/42/tabs/posts')).toEqual({
            userId: '42',
            tab: 'posts'
        });
        expect(await call('users/42/posts')).toEqual({ posts: '42' });
    }
});
