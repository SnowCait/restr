import { Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { cache } from "hono/cache";
import { streamSSE } from "hono/streaming";
import { kinds, nip19 } from "nostr-tools";
import { Event, Filter } from "nostr-typedef";
import {
  createRxBackwardReq,
  createRxNostr,
  latest,
  LazyFilter,
  uniq,
} from "rx-nostr";
import { verifier, verify } from "rx-nostr-crypto";
import { firstValueFrom, lastValueFrom } from "rxjs";

const app = new Hono();
const eoseTimeout = 3000;
const okTimeout = 3000;

const cacheOptions = {
  cacheName: "restr-v0",
  cacheControl: "max-age=3600",
  wait: false,
};
if (globalThis.navigator?.userAgent !== "Cloudflare-Workers")
  cacheOptions.wait = true;

app.get(
  "/:nevent{nevent1[0-9a-z]{6,}}",
  cache(cacheOptions),
  async (context: Context): Promise<Response> => {
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

    return context.json(event);
  },
);

app.get(
  "/:naddr{naddr1[0-9a-z]{6,}}",
  cache(cacheOptions),
  async (context: Context): Promise<Response> => {
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

    return context.json(event);
  },
);

app.get(
  "/:nprofile{nprofile1[0-9a-z]{6,}}",
  cache(cacheOptions),
  async (context: Context): Promise<Response> => {
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

    return context.json(event);
  },
);

app.post("/req", async (context: Context): Promise<Response> => {
  const { relays, filters } = await retrieveReqParams(context);
  const rxNostr = createRxNostr({ verifier, eoseTimeout });
  rxNostr.setDefaultRelays(relays);
  const req = createRxBackwardReq();
  const { promise, resolve } = Promise.withResolvers<void>();
  const events: Event[] = [];
  rxNostr
    .use(req)
    .pipe(uniq())
    .subscribe({
      next: async ({ event }) => {
        events.push(event);
      },
      complete: () => {
        rxNostr.dispose();
        resolve();
      },
      error: (error) => {
        console.error(error);
        rxNostr.dispose();
        resolve();
      },
    });
  req.emit(filters);
  req.over();
  await promise;
  return context.json(
    events
      .toSorted(reverseChronological)
      .slice(0, filters[0].limit ?? Infinity),
  );
});

app.post("/req/stream", async (context: Context): Promise<Response> => {
  const { relays, filters } = await retrieveReqParams(context);
  return streamSSE(context, (stream): Promise<void> => {
    const rxNostr = createRxNostr({ verifier, eoseTimeout });
    rxNostr.setDefaultRelays(relays);
    const req = createRxBackwardReq();
    const { promise, resolve } = Promise.withResolvers<void>();
    rxNostr
      .use(req)
      .pipe(uniq())
      .subscribe({
        next: async ({ event }) => {
          await stream.writeSSE({
            data: JSON.stringify(event),
          });
        },
        complete: () => {
          rxNostr.dispose();
          resolve();
        },
        error: (error) => {
          console.error(error);
          rxNostr.dispose();
          resolve();
        },
      });
    req.emit(filters);
    req.over();
    return promise;
  });
});

app.post(
  "/:nevent{nevent1[0-9a-z]{6,}}",
  async (context: Context): Promise<Response> => {
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

    const { relays } = pointer;
    if (relays === undefined || relays.length === 0) {
      console.error("Relays not found");
      throw new HTTPException(400);
    }

    let event: Event | undefined;
    try {
      event = await context.req.json<Event>();
    } catch (error) {
      console.error("JSON parse error", error);
      throw new HTTPException(400);
    }

    if (!verify(event)) {
      console.error("Invalid event");
      throw new HTTPException(400);
    }

    const result = await send(relays, event);

    return context.json(Object.fromEntries(result));
  },
);

async function retrieveReqParams(
  context: Context,
): Promise<{ relays: string[]; filters: Filter[] }> {
  let params: { relays?: string[]; filters?: Filter[] };
  try {
    params = await context.req.json();
  } catch (error) {
    console.error("JSON parse error", error);
    throw new HTTPException(400);
  }
  if (params.relays === undefined || params.relays.length === 0) {
    console.error("Relays not found");
    throw new HTTPException(400);
  }
  if (params.filters === undefined || params.filters.length === 0) {
    console.error("Filters not found");
    throw new HTTPException(400);
  }
  console.log("[params]", params);

  return params as { relays: string[]; filters: Filter[] };
}

function reverseChronological(x: Event, y: Event): number {
  return y.created_at - x.created_at;
}

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

async function send(
  relays: string[],
  event: Event,
): Promise<Map<string, boolean>> {
  const { promise, resolve } = Promise.withResolvers<Map<string, boolean>>();
  const rxNostr = createRxNostr({ verifier, okTimeout });
  const result = new Map<string, boolean>();
  rxNostr.setDefaultRelays(relays);
  rxNostr
    .send(event, { completeOn: "all-ok", errorOnTimeout: false })
    .subscribe({
      next: ({ from, ok }) => result.set(from, ok),
      complete: () => {
        rxNostr.dispose();
        resolve(result);
      },
    });
  return promise;
}

export default app;
