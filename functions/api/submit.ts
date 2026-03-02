interface ClubSubmission {
  name: string;
  category: string;
  gmap: string;
  website?: string;
  notes?: string;
}

export const onRequestPost = async (ctx: any) => {
  let submission: ClubSubmission;
  try {
    submission = await ctx.request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  if (!submission.name || typeof submission.name !== 'string') {
    return new Response('Name is required', { status: 400 });
  }
  if (!submission.gmap || typeof submission.gmap !== 'string') {
    return new Response('Google Maps link is required', { status: 400 });
  }

  const key = 'user-submissions';
  const existing: ClubSubmission[] =
    (await ctx.env.SPOTS_KV.get(key, { type: 'json' })) || [];
  existing.push({ ...submission, submittedAt: new Date().toISOString() } as any);
  await ctx.env.SPOTS_KV.put(key, JSON.stringify(existing));
  return Response.json({ ok: true });
};
