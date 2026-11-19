import {
  makeOrderRequest,
  type DraftRow,
  type Item,
  type OrderRequest,
  type SavedOrder,
} from "../domain";

export type OrderDraft = {
  rows: DraftRow[];
  attempt?: OrderRequest;
  saved?: SavedOrder;
  // Keep this key when unlocking an uncertain submission, so a late original
  // response and a revised save can never create two orders.
  submissionId?: string;
};
export type SaveStage = "checking" | "confirming" | "saving";
export interface OrderReview {
  getDraft(): OrderDraft | null;
  replaceDraft(expected: OrderDraft, next: OrderDraft): boolean;
  active(): boolean;
  check(): Promise<Item[]>;
  confirm(retry: boolean, request: OrderRequest): Promise<boolean>;
  create(request: OrderRequest): Promise<SavedOrder>;
  recover(localId: string): Promise<SavedOrder | null>;
  stage(value: SaveStage): void;
}

// Each continuation belongs to the reviewed draft. A response may arrive after
// navigation, but can only complete its original submission, never another cart.
export async function saveReviewedOrder(review: OrderReview) {
  const draft = review.getDraft();
  if (!draft || draft.saved || !review.active()) return;
  let payload = draft.attempt;
  const firstRequest = !payload;
  if (!payload) {
    review.stage("checking");
    const items = await review.check();
    if (!review.active() || review.getDraft() !== draft) return;
    const changed = draft.rows.filter(({ item }) => {
      const fresh = items.find((i) => i.id === item.id);
      if (fresh && fresh.unit !== item.unit)
        throw new Error(
          `${item.name}'s unit changed. Remove and re-add this line before saving.`,
        );
      return (
        !fresh?.isActive ||
        fresh.version !== item.version ||
        fresh.quantity !== item.quantity ||
        fresh.minimumStock !== item.minimumStock ||
        fresh.name !== item.name
      );
    });
    if (changed.length)
      throw new Error(
        `Inventory changed for ${changed.map((r) => r.item.name).join(", ")}. Use “Refresh draft” to review current stock. Your order quantities are retained.`,
      );
    payload = makeOrderRequest(
      draft.rows,
      draft.submissionId || crypto.randomUUID(),
    );
  }
  review.stage("confirming");
  if (
    !(await review.confirm(!firstRequest, payload)) ||
    !review.active() ||
    review.getDraft() !== draft
  )
    return;
  const submitted = { ...draft, attempt: payload };
  if (!review.replaceDraft(draft, submitted)) return;
  review.stage("saving");
  try {
    const saved = await review.create(payload);
    const current = review.getDraft();
    if (current?.attempt === payload && !current.saved)
      review.replaceDraft(current, { ...current, saved });
    return saved;
  } catch (error) {
    const status = (error as { status?: number }).status;
    // A retry rejection does not prove that the original unknown request failed.
    if (
      firstRequest &&
      !draft.submissionId &&
      [400, 401, 403, 404, 409, 422].includes(status || 0)
    ) {
      const current = review.getDraft();
      if (current === submitted && !current.saved)
        review.replaceDraft(current, { ...current, attempt: undefined });
    } else if (
      (!firstRequest || draft.submissionId) &&
      [400, 404, 409, 422].includes(status || 0)
    ) {
      // An unavailable lookup must keep the draft locked. A successful lookup
      // either recovers the saved order or permits edits with the SAME key.
      const saved = await review.recover(payload.localId);
      const current = review.getDraft();
      if (!review.active() || current !== submitted) throw error;
      if (saved) {
        review.replaceDraft(current, { ...current, saved });
        return saved;
      }
      review.replaceDraft(current, {
        ...current,
        attempt: undefined,
        submissionId: payload.localId,
      });
    }
    throw error;
  }
}

export function mergeMissingRows(current: DraftRow[], incoming: DraftRow[]) {
  const ids = new Set(current.map((row) => row.item.id));
  return [...current, ...incoming.filter((row) => !ids.has(row.item.id))];
}
