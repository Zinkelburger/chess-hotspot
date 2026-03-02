export interface VisitRequest {
  spotId: string;
  rating: number;
  visitedAt: string;
}

interface VisitData {
  visits: number;
  ratingSum: number;
}

export const onRequestGet = async (ctx: any) => {
  const url = new URL(ctx.request.url);
  const spotId = url.searchParams.get('spotId');
  if (!spotId) return new Response('Missing spotId', { status: 400 });

  const key = `spot:${spotId}`;
  const data: VisitData | null = await ctx.env.SPOTS_KV.get(key, { type: 'json' });
  const visits = data?.visits ?? 0;
  const rating = data && data.visits ? data.ratingSum / data.visits : null;
  return Response.json({ visits, rating });
};

export const onRequestPost = async (ctx: any) => {
  let body: VisitRequest;
  try {
    body = await ctx.request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  if (!body.spotId || !body.visitedAt) {
    return new Response('Missing required fields', { status: 400 });
  }
  if (typeof body.rating !== 'number' || body.rating < 1 || body.rating > 5) {
    return new Response('Rating must be 1–5', { status: 400 });
  }

  const key = `spot:${body.spotId}`;
  const data: VisitData =
    (await ctx.env.SPOTS_KV.get(key, { type: 'json' })) || { visits: 0, ratingSum: 0 };
  data.visits += 1;
  data.ratingSum += body.rating;
  await ctx.env.SPOTS_KV.put(key, JSON.stringify(data));
  return Response.json({ ok: true });
};
