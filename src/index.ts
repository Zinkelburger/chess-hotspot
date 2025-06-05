/*  src/index.ts  --------------------------------------------------------- */
export interface Env {
  SPOTS_KV: KVNamespace;
}

/* Import your endpoint functions */
import { onRequestPost as submitPost } from '../functions/submit';
import {
  onRequestGet as visitGet,
  onRequestPost as visitPost,
} from '../functions/visit';

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

    /* Anything else */
    return new Response('Not found', { status: 404 });
  },
};
