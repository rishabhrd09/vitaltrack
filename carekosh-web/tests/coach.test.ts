import { describe, expect, it } from "vitest";
import type { DraftRow, Item } from "../src/domain";
import { answerIntent } from "../src/domain/assistant/core";
import { toPlan } from "../src/domain/assistant/contracts";
import { routeLocally } from "../src/domain/assistant/queries";
import { Clarification } from "../src/domain/assistant/selection";
import { prepareCoachDraft } from "../src/services/coach-draft";

const item = (id: string, name: string, quantity = 2): Item => ({
  id,
  name,
  quantity,
  categoryId: "supplies",
  minimumStock: 5,
  unit: "pieces",
  isActive: true,
  isCritical: false,
  version: 1,
  createdAt: "2026-10-25",
  updatedAt: "2026-10-25",
});
const items = [
  item("gauze", "Sterile Gauze"),
  item("gloves", "Sterile Gloves"),
  item("mask", "Face Mask", 0),
];
const context = { categories: [], categoriesKnown: true };
function draftPlan(question: string, hasDraft = false) {
  const intent = routeLocally(
    question,
    items.map((i) => i.name),
    hasDraft,
  );
  if (!intent || !("version" in intent)) throw new Error("Expected plan");
  return toPlan(intent);
}

describe("Care Coach mobile conversation", () => {
  it.each(["packets", "box", "boxes", "sets", "cylinders"])(
    "keeps the recorded %s unit separate from the item name",
    (unit) => {
      const stock = [{ ...items[1], unit }];
      const rows = prepareCoachDraft(
        draftPlan(`Prepare a draft for 8 ${unit} of sterile gloves`),
        stock,
        [],
        null,
        context,
      );
      expect(rows[0]).toMatchObject({
        quantity: 8,
        item: { id: "gloves", unit },
      });
    },
  );
  it("answers a short stock follow-up only from the previously resolved item", () => {
    const intent = routeLocally(
      "How many are left?",
      items.map((i) => i.name),
    );
    if (!intent || "version" in intent) throw new Error("Expected item lookup");
    expect(answerIntent(intent, items, 1, "gloves")).toMatchObject({
      resolvedId: "gloves",
      items: [items[1]],
    });
    expect(answerIntent(intent, items, 1).items).toEqual([]);
  });
  it("offers exact choices for partial item names", () => {
    const intent = routeLocally(
      "Find sterile",
      items.map((i) => i.name),
    );
    if (!intent || "version" in intent) throw new Error("Expected item lookup");
    const answer = answerIntent(intent, items, 1);
    expect(answer.choices.map((i) => i.id)).toEqual(["gauze", "gloves"]);
    expect(answer.items).toEqual([]);
  });

  it("does not invent stock for an unknown item", () => {
    const intent = routeLocally(
      "Find bandages",
      items.map((i) => i.name),
    );
    if (!intent || "version" in intent) throw new Error("Expected item lookup");
    expect(answerIntent(intent, items, 1)).toMatchObject({
      title: "Item not found",
      items: [],
      choices: [],
    });
  });

  it("retains requested quantities while resolving an ambiguous draft line", () => {
    const plan = draftPlan("Prepare a draft for 7 sterile");
    expect(() => prepareCoachDraft(plan, items, [], null, context)).toThrow(
      Clarification,
    );
    const rows = prepareCoachDraft(plan, items, [], null, context, {
      sterile: "gloves",
    });
    expect(rows.map((r) => [r.item.id, r.quantity])).toEqual([["gloves", 7]]);
    expect(items[1].quantity).toBe(2);
  });

  it("adds to the proposed quantity rather than an older workspace draft", () => {
    const proposal = prepareCoachDraft(
      draftPlan("Prepare a draft for 2 sterile gloves"),
      items,
      [],
      null,
      context,
    );
    const workspace: DraftRow[] = [
      { item: items[1], quantity: 50, source: "manual" },
    ];
    const edited = prepareCoachDraft(
      draftPlan("Add 3 more", true),
      items,
      workspace,
      proposal,
      { ...context, focus: [items[1]] },
    );
    expect(edited[0].quantity).toBe(5);
    expect(proposal[0].quantity).toBe(2);
    expect(workspace[0].quantity).toBe(50);
    expect(items[1].quantity).toBe(2);
  });

  it("uses the workspace draft if no Coach proposal exists", () => {
    const workspace: DraftRow[] = [
      { item: items[1], quantity: 4, source: "manual" },
    ];
    const rows = prepareCoachDraft(
      draftPlan("Add 3 more", true),
      items,
      workspace,
      null,
      { ...context, focus: [items[1]] },
    );
    expect(rows[0].quantity).toBe(7);
    expect(workspace[0].quantity).toBe(4);
  });

  it("keeps an intentionally empty proposal instead of resurrecting the workspace draft", () => {
    const workspace: DraftRow[] = [
      { item: items[1], quantity: 50, source: "manual" },
    ];
    const rows = prepareCoachDraft(
      draftPlan("Add 3 more", true),
      items,
      workspace,
      [],
      { ...context, focus: [items[1]] },
    );
    expect(rows[0].quantity).toBe(3);
  });

  it("does not treat a new draft request as an edit to the previous proposal", () => {
    const old: DraftRow[] = [
      { item: items[1], quantity: 50, source: "manual" },
    ];
    const rows = prepareCoachDraft(
      draftPlan("Prepare a draft for 4 face mask"),
      items,
      old,
      old,
      context,
    );
    expect(rows.map((r) => [r.item.id, r.quantity])).toEqual([["mask", 4]]);
  });

  it("requires a choice before editing an ambiguous previous result", () => {
    const plan = draftPlan("Add 3 more", true);
    const proposal: DraftRow[] = items
      .slice(0, 2)
      .map((item) => ({ item, quantity: 2, source: "manual" }));
    expect(() =>
      prepareCoachDraft(plan, items, [], proposal, {
        ...context,
        focus: items.slice(0, 2),
      }),
    ).toThrow(Clarification);
    const rows = prepareCoachDraft(
      plan,
      items,
      [],
      proposal,
      { ...context, focus: items.slice(0, 2) },
      { __previous__: "gloves" },
    );
    expect(rows.map((r) => r.quantity)).toEqual([2, 5]);
  });

  it("does not convert units or invent minimums", () => {
    expect(() =>
      prepareCoachDraft(
        draftPlan("Prepare a draft for 5 boxes of sterile gloves"),
        items,
        [],
        null,
        context,
      ),
    ).toThrow("recorded in pieces");
    expect(() =>
      prepareCoachDraft(
        draftPlan("Prepare a draft for all out-of-stock items"),
        [item("mask", "Face Mask", 0)].map((i) => ({ ...i, minimumStock: 0 })),
        [],
        null,
        context,
      ),
    ).toThrow("No meaningful minimum");
  });

  it.each(["Set stock to 20", "Save the order", "Mark order received"])(
    "keeps %s outside Coach actions",
    (question) => {
      const intent = routeLocally(
        question,
        items.map((i) => i.name),
        true,
      );
      expect(intent?.intent).toBe("unsupported_action");
    },
  );
});
