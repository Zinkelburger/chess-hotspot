export const onRequestPost = async (ctx: any) => {
  const submission = await ctx.request.json();
  const key = 'user-submissions';
  const existing: any[] = (await ctx.env.SPOTS_KV.get(key, { type: 'json' })) || [];
  existing.push({ ...submission, submittedAt: new Date().toISOString() });
  await ctx.env.SPOTS_KV.put(key, JSON.stringify(existing));
  return Response.json({ ok: true });
};