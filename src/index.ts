import { Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { kinds, nip19 } from "nostr-tools";
import { Event } from "nostr-typedef";
import {
  createRxBackwardReq,
  createRxNostr,
  latest,
  LazyFilter,
  uniq,
} from "rx-nostr";
import { verifier } from "rx-nostr-crypto";
import { firstValueFrom, lastValueFrom } from "rxjs";

const app = new Hono();
const cache = caches.default;
const eoseTimeout = 3000;

app.get(
  "/:nevent{nevent1[0-9a-z]{6,}}",
  async (context: Context): Promise<Response> => {
    const cachedResponse = await cache.match(context.req.raw);
    if (cachedResponse !== undefined) {
      return cachedResponse;
    }

    const nevent = context.req.param("nevent");
    let pointer: nip19.EventPointer;
    try {
      const { type, data } = nip19.decode(nevent);
      if (type !== "nevent") {
        console.error("Logic error");
        throw new Error();
      }
      pointer = data;
    } catch (error) {
      console.error(error);
      throw new HTTPException(400);
    }

    const { id, relays } = pointer;
    if (relays === undefined || relays.length === 0) {
      console.error("Relays not found");
      throw new HTTPException(400);
    }

    const event = await fetchFirstEvent(relays, { ids: [id] });
    if (event === undefined) {
      throw new HTTPException(404);
    }

    const response = context.json(event);
    await cache.put(context.req.raw, response.clone());
    return response;
  },
);

app.get(
  "/:naddr{naddr1[0-9a-z]{6,}}",
  async (context: Context): Promise<Response> => {
    const cachedResponse = await cache.match(context.req.raw);
    if (cachedResponse !== undefined) {
      return cachedResponse;
    }

    const naddr = context.req.param("naddr");
    let pointer: nip19.AddressPointer;
    try {
      const { type, data } = nip19.decode(naddr);
      if (type !== "naddr") {
        console.error("Logic error");
        throw new Error();
      }
      pointer = data;
    } catch (error) {
      console.error(error);
      throw new HTTPException(400);
    }

    const { kind, pubkey, identifier, relays } = pointer;
    if (relays === undefined || relays.length === 0) {
      console.error("Relays not found");
      throw new HTTPException(400);
    }

    const identifierFilter = kinds.isReplaceableKind(kind)
      ? {}
      : { "#d": [identifier] };
    const event = await fetchLastEvent(relays, {
      kinds: [kind],
      authors: [pubkey],
      ...identifierFilter,
    });
    if (event === undefined) {
      throw new HTTPException(404);
    }

    const response = context.json(event);
    await cache.put(context.req.raw, response.clone());
    return response;
  },
);

app.get(
  "/:nprofile{nprofile1[0-9a-z]{6,}}",
  async (context: Context): Promise<Response> => {
    const cachedResponse = await cache.match(context.req.raw);
    if (cachedResponse !== undefined) {
      return cachedResponse;
    }

    const nprofile = context.req.param("nprofile");
    let pointer: nip19.ProfilePointer;
    try {
      const { type, data } = nip19.decode(nprofile);
      if (type !== "nprofile") {
        console.error("Logic error");
        throw new Error();
      }
      pointer = data;
    } catch (error) {
      console.error(error);
      throw new HTTPException(400);
    }

    const { pubkey, relays } = pointer;
    if (relays === undefined || relays.length === 0) {
      console.error("Relays not found");
      throw new HTTPException(400);
    }

    const event = await fetchLastEvent(relays, {
      kinds: [0],
      authors: [pubkey],
    });
    if (event === undefined) {
      throw new HTTPException(404);
    }

    const response = context.json(event);
    await cache.put(context.req.raw, response.clone());
    return response;
  },
);

async function fetchFirstEvent(
  relays: string[],
  filter: LazyFilter,
): Promise<Event | undefined> {
  const rxNostr = createRxNostr({ verifier, eoseTimeout });
  rxNostr.setDefaultRelays(relays);
  const req = createRxBackwardReq();
  const promise = firstValueFrom(rxNostr.use(req));
  req.emit([filter]);
  req.over();
  try {
    const packet = await promise;
    return packet.event;
  } catch (error) {
    console.error(error);
    return undefined;
  } finally {
    rxNostr.dispose();
  }
}

async function fetchLastEvent(
  relays: string[],
  filter: LazyFilter,
): Promise<Event | undefined> {
  const rxNostr = createRxNostr({ verifier, eoseTimeout });
  rxNostr.setDefaultRelays(relays);
  const req = createRxBackwardReq();
  const promise = lastValueFrom(rxNostr.use(req).pipe(uniq(), latest()));
  req.emit([filter]);
  req.over();
  try {
    const packet = await promise;
    return packet.event;
  } catch (error) {
    console.error(error);
    return undefined;
  } finally {
    rxNostr.dispose();
  }
}

export default app;
