import type { Adapter } from '@domain-first/handlers-rest';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Plain JSON response, no runtime dependency on `@sveltejs/kit`.
 *
 * @param data response data
 * @param init response initialization
 * @returns Response object can be sent to a client
 */
function jsonResponse<T>(data: T, init?: ResponseInit) {
    return new Response(JSON.stringify(data), {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(init?.headers || {})
        }
    });
}

/**
 * Endpoints built with this adapter have the SvelteKit
 * `RequestHandler` signature: `(event: RequestEvent) => Promise<Response>`,
 * so they can be exported from `+server.ts` directly.
 */
export const svelteAdapter: Adapter<[event: RequestEvent], Response> = {
    input: {
        body: (x) => x.request.json(),
        pathParams: (x) => x.params ?? {},
        queryParams: (x) => Object.fromEntries(x.url.searchParams.entries()),
        cookies: (x) =>
            x.cookies.getAll().reduce(
                (acc, cur) => {
                    acc[cur.name] = cur.value;
                    return acc;
                },
                {} as Record<string, string>
            ),
        formData: (x) => x.request.formData(),
        headers: (x) => Object.fromEntries(x.request.headers.entries())
    },

    output: (x, event) => {
        if (x.success) {
            if (x.cookies) {
                const cookiesConfiguration = x.configuration?.cookies ?? {};
                for (const [name, value] of Object.entries(x.cookies)) {
                    const cookieConfig = cookiesConfiguration[name];
                    event.cookies.set(
                        name,
                        value,
                        cookieConfig
                            ? {
                                  path: '/',
                                  maxAge: cookieConfig.maxAge,
                                  httpOnly: cookieConfig.httpOnly
                              }
                            : { path: '/' }
                    );
                }
            }

            return jsonResponse(x.body, {
                headers: (x.headers ?? {}) as Record<string, string>,
                status: x.statusCode
            });
        }

        return jsonResponse(x.error, { status: x.statusCode });
    }
};
