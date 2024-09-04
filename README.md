# Restr

Nostr REST API proxy.

## Usage

### GET `http://127.0.0.1:8787/<nevent|naddr|nprofile>`

`<nevent|naddr|nprofile>` is
[NIP-19](https://github.com/nostr-protocol/nips/blob/master/19.md) and requires
**id** and **relays**.

### POST `http://127.0.0.1:8787/<nevent>`

`<nevent>` is [NIP-19](https://github.com/nostr-protocol/nips/blob/master/19.md)
and requires **relays**.

Request body is event json.

## Development

```
npm install
npm run dev
```

## Test

```
cd test/
docker compose up --build -d --wait
npm test
docker compose down --volumes
```

## Deploy

```
npm run deploy
```
