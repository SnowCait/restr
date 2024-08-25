import { Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { nip19 } from "nostr-tools";
import { Event } from "nostr-typedef";
import { createRxBackwardReq, createRxNostr } from "rx-nostr";
import { verifier } from "rx-nostr-crypto";
import { firstValueFrom } from "rxjs";

const app = new Hono();
const cache = caches.default;

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

    const rxNostr = createRxNostr({ verifier, eoseTimeout: 3000 });
    rxNostr.setDefaultRelays(relays);
    const req = createRxBackwardReq();
    const promise = firstValueFrom(rxNostr.use(req));
    req.emit([{ ids: [id] }]);
    req.over();
    let event: Event | undefined;
    try {
      const packet = await promise;
      event = packet.event;
    } catch (error) {
      console.error(error);
      throw new HTTPException(404);
    }

    const response = context.json(event);
    await cache.put(context.req.raw, response.clone());
    return response;
  },
);

export default app;
