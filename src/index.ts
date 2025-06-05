/// <reference types="@cloudflare/workers-types" />
export interface Env {
  SPOTS_KV: KVNamespace;
  ASSETS: Fetcher;
}

/* Import your endpoint functions */
import { onRequestPost as submitPost } from '../functions/api/submit';
import {
  onRequestGet as visitGet,
  onRequestPost as visitPost,
} from '../functions/api/visit';

/* Tiny hand-rolled router */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);

    /* /submit  (POST) ---------------------------------------------------- */
    if (pathname === '/submit' && request.method === 'POST') {
      return submitPost({ request, env, ctx });
    }

    /* /visit  (GET & POST) ---------------------------------------------- */
    if (pathname === '/visit') {
      if (request.method === 'GET')  return visitGet ({ request, env, ctx });
      if (request.method === 'POST') return visitPost({ request, env, ctx });
    }

    /* Anything else → serve static files from ./out via ASSETS binding */
    return env.ASSETS.fetch(request);
  },
};
