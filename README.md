# Restr

Nostr REST API proxy.

Client implementation is simplified by having proxy server handle communication
with relays.\
It also reduces the amount of communication on client.

## Usage

### GET `/{nevent}`

`{nevent}` is [NIP-19](https://github.com/nostr-protocol/nips/blob/master/19.md)
and requires **id** and **relays**.

### GET `/{naddr}`

`{naddr}` is [NIP-19](https://github.com/nostr-protocol/nips/blob/master/19.md)
and requires **kind**, **pubkey**, **identifier** and **relays**.

### GET `/{nprofile}`

`{nprofile}` is
[NIP-19](https://github.com/nostr-protocol/nips/blob/master/19.md) and requires
**pubkey** and **relays**.

This is an alias of naddr with kind 0 and empty identifier.

### POST `/{nevent}`

`{nevent}` is [NIP-19](https://github.com/nostr-protocol/nips/blob/master/19.md)
and requires **relays**.

Request body is event JSON.

### POST `/req`

Fetch events.\
POST method is used because filters can be long.

Request body contains relays and filters.

```json
{
  "relays": ["wss://example.com/"],
  "filters": [{ "limit": 10 }]
}
```

### POST `/req/stream`

This is
[Server-Sent Events](https://developer.mozilla.org/docs/Web/API/Server-sent_events)
with POST method.\
POST method is used because filters can be long.\
Use a library which can handle POST method
([sse.js](https://www.npmjs.com/package/sse.js),
[launchdarkly-eventsource](https://www.npmjs.com/package/launchdarkly-eventsource),
[eventsource-client](https://www.npmjs.com/package/eventsource-client),
[@microsoft/fetch-event-source](https://www.npmjs.com/package/@microsoft/fetch-event-source),
etc.) instead of
[EventSource](https://developer.mozilla.org/docs/Web/API/EventSource).

Request body contains relays and filters.

```json
{
  "relays": ["wss://example.com/"],
  "filters": [{ "limit": 10 }]
}
```

## Development

```shell
npm install
npm run dev
```

## Test

```shell
cd test/
docker compose up --build -d --wait
npm test
docker compose down --volumes
```

## Deploy

### Cloudflare Workers

#### With Git integration

See [Document](https://developers.cloudflare.com/workers/ci-cd/builds/).

#### With Wrangler

```shell
npm run deploy
```

### Deno Deploy

#### With GitHub integration

See [Document](https://docs.deno.com/deploy/manual/how-to-deploy/).

#### With deployctl

See [Document](https://docs.deno.com/deploy/manual/deployctl/).

An example workflow of GitHub Actions is
[here](.github/workflows/deno-deploy.yml.example).

### Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

### Docker

#### With Docker Compose

```shell
docker compose up
```
