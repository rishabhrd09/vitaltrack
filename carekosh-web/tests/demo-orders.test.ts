import { expect, it } from "vitest";
import { demoRepository, resetDemo } from "../src/demo/repository";
import { makeOrderRequest } from "../src/domain";

it("demo retries recover the same order, reject changed payloads and apply stock once", async () => {
  resetDemo();
  const before = await demoRepository.load();
  const item = before.items[0];
  const request = makeOrderRequest(
    [{ item, quantity: 2, source: "manual" }],
    "demo-retry",
  );
  const saved = await demoRepository.createOrder(request);
  const retry = structuredClone(request);
  retry.items[0].expectedVersion += 1;
  expect((await demoRepository.createOrder(retry)).id).toBe(saved.id);
  retry.items[0].quantity = 3;
  await expect(demoRepository.createOrder(retry)).rejects.toMatchObject({
    status: 409,
  });
  await demoRepository.orderAction(saved.id, "received");
  await demoRepository.orderAction(saved.id, "apply");
  await demoRepository.orderAction(saved.id, "apply");
  const after = await demoRepository.load();
  expect(after.orders).toHaveLength(before.orders.length + 1);
  expect(after.items.find((row) => row.id === item.id)?.quantity).toBe(
    item.quantity + 2,
  );
});
