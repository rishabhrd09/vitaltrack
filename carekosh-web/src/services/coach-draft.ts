import type { DraftRow, Item } from "../domain";
import type { Plan } from "../domain/assistant/contracts";
import {
  prepareDraftResult,
  type DraftContext,
} from "../domain/assistant/drafts";

/** Keep follow-up edits on the proposal being reviewed, without changing the workspace draft. */
export function prepareCoachDraft(
  plan: Plan,
  items: Item[],
  workspace: DraftRow[],
  proposal: DraftRow[] | null,
  context: DraftContext,
  selected: Record<string, string> = {},
): DraftRow[] {
  return prepareDraftResult(
    plan,
    items,
    plan.draft?.mode === "edit" ? (proposal ?? workspace) : [],
    selected,
    context,
  ).rows.map((row) => ({
    ...row,
    source: row.source === "suggested" ? "suggested" : "manual",
  }));
}
