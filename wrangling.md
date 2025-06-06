<https://developers.cloudflare.com/kv/get-started/>
`npx wrangler kv namespace create chess-hotspot`

`wrangler kv namespace`

`wrangler kv namespace create chess-hotspot-preview --preview`

# Testing
`wrangler dev --remote`

```
# POST /submit
curl -X POST -H "Content-Type: application/json" \
     -d '{"example":"data"}' \
     https://chess-hotspot.<rand>.workers.dev/submit

# GET /visit?spotId=demo
curl "https://chess-hotspot.<rand>.workers.dev/visit?spotId=demo"

# POST /visit
curl -X POST -H "Content-Type: application/json" \
     -d '{"spotId":"demo","rating":5,"visitedAt":"2025-06-05T00:00:00Z"}' \
     https://chess-hotspot.<rand>.workers.dev/visit
```

# make the site static
pnpm build 
pnpm export 

```
assets.bucket is a required field — if you see this error, you need to update Wrangler to at least 3.78.10 or later. bucket is not a required field.
```

pnpm add -D wrangler@latest 

Fuck that other shit
`wrangler pages dev`
