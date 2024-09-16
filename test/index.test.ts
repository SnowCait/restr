import { assert, beforeAll, expect, test } from "vitest";
import {
  Event,
  finalizeEvent,
  generateSecretKey,
  nip19,
  Relay,
} from "nostr-tools";
import worker from "../src";

const relayUrl = "ws://localhost:7777/";
let savedEvent: Event | undefined;

beforeAll(async () => {
  const seckey = generateSecretKey();
  const event = await finalizeEvent(
    {
      kind: 1,
      content: "",
      tags: [],
      created_at: Math.floor(Date.now() / 1000),
    },
    seckey,
  );
  const relay = await Relay.connect(relayUrl);
  await relay.publish(event);
  relay.close();
  savedEvent = event;
});

test("root is 404", async () => {
  const response = await worker.request("/");
  expect(response.status).toBe(404);
});

test.skip("nevent", async () => {
  assert(savedEvent !== undefined);
  const nevent = nip19.neventEncode({ id: savedEvent.id, relays: [relayUrl] });
  const response = await worker.request(`/${nevent}`);
  const event = (await response.json()) satisfies Event;
  expect(response.status).toBe(200);
  expect(event.id).toBe(savedEvent.id);
});

test("req", async () => {
  assert(savedEvent !== undefined);
  const response = await worker.request("/req", {
    method: "POST",
    body: JSON.stringify({
      relays: [relayUrl],
      filters: [
        {
          limit: 1,
        },
      ],
    }),
  });
  const events = (await response.json()) satisfies Event[];
  expect(response.status).toBe(200);
  expect(events.length).toBe(1);
  expect(events[0].id).toBe(savedEvent.id);
});
