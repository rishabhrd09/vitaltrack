import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Sparkles,
  ArrowUp,
  ArrowUpRight,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useApp } from "../context";
import { Dialog, ErrorBox, StockBadge, Spinner } from "./ui";
import { routeLocally } from "../domain/assistant/queries";
import { answerIntent, command, type Answer } from "../domain/assistant/core";
import { toPlan, validatePlan, type Plan } from "../domain/assistant/contracts";
import {
  evaluateSelection,
  selectionAnswer,
  Clarification,
} from "../domain/assistant/selection";
import { prepareCoachDraft } from "../services/coach-draft";
import { DEMO, request, sessionEpoch } from "../services/api";
import { printInventory } from "../services/export";
import { unitLabel, type DraftRow, type Item } from "../domain";
type PendingPlan = {
  plan: Plan;
  selected: Record<string, string>;
  previous: Item[];
  proposal: DraftRow[] | null;
  clarification?: Clarification;
};
type Caps = {
  interpret: boolean;
  interpret_contracts: number[];
  consent_version: string;
  consented: boolean;
  scopes: string[];
};
const VERSION = "voice-2026-10-06";
export function Coach({
  supplyAvailable = false,
}: {
  supplyAvailable?: boolean;
}) {
  const a = useApp(),
    navigate = useNavigate(),
    [q, setQ] = useState(""),
    [asked, setAsked] = useState(""),
    [answer, setAnswer] = useState<Answer | null>(null),
    [proposed, setProposed] = useState<DraftRow[] | null>(null),
    [pending, setPending] = useState<PendingPlan | null>(null),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false),
    [caps, setCaps] = useState<Caps | null>(null),
    [consentBusy, setConsentBusy] = useState(false),
    [capsChecked, setCapsChecked] = useState(DEMO);
  const cloud = !!(
    caps?.consented &&
    caps.consent_version === VERSION &&
    caps.scopes.includes("groq_text")
  );
  const abort = useRef<AbortController | null>(null);
  const answerRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (working || !answer) return;
    answerRef.current?.focus({ preventScroll: true });
    answerRef.current?.scrollIntoView({ block: "center" });
  }, [answer, working]);
  useEffect(() => {
    const c = new AbortController();
    if (!DEMO)
      void request<Caps>("/ai/capabilities", "GET", undefined, c.signal)
        .then(setCaps)
        .catch(() => {
          if (!c.signal.aborted)
            setError(
              "Online settings could not be checked. Local inventory commands still work.",
            );
        })
        .finally(() => {
          if (!c.signal.aborted) setCapsChecked(true);
        });
    return () => {
      c.abort();
      abort.current?.abort();
    };
  }, []);
  const reviewProposal = async (rows: DraftRow[]) => {
    const reviewed = a.getDraft();
    const epoch = sessionEpoch();
    if (reviewed?.attempt || a.busy) {
      setError("Resolve your existing submission first.");
      return;
    }
    if (
      reviewed?.rows.length &&
      !(await a.confirm({
        title: "Replace the current draft?",
        body: "This will replace your unsaved order draft with the supplies shown here.",
        label: "Replace draft",
      }))
    )
      return;
    if (a.getDraft() !== reviewed || sessionEpoch() !== epoch) return;
    a.setDraft({ rows });
    a.setCoachOpen(false);
    navigate("/orders/create");
  };
  const ask = async (question: string, resume?: PendingPlan) => {
    if (!question.trim() || !a.data) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const epoch = sessionEpoch();
    setWorking(true);
    setError("");
    setPending(null);
    setAsked(question);
    setQ("");
    try {
      let intent =
        resume?.plan ??
        routeLocally(
          question,
          a.data.items.map((i) => i.name),
          !!(proposed?.length || a.draft?.rows.length),
          a.data.categories.map((c) => c.name),
        );
      if (!intent && cloud && caps?.interpret) {
        intent = validatePlan(
          await request(
            "/ai/interpret",
            "POST",
            {
              question,
              has_previous_item: !!answer?.resolvedId,
              contract_version: 3,
            },
            controller.signal,
          ),
        );
      }
      if (epoch !== sessionEpoch() || controller.signal.aborted) return;
      if (!intent) intent = command("clarify");
      if ("version" in intent) {
        const p = toPlan(intent);
        const pendingPlan: PendingPlan = resume ?? {
          plan: p,
          selected: {},
          previous: answer?.items || [],
          proposal: proposed,
        };
        // Keep the original plan and context across touch clarification.
        setPending(pendingPlan);
        if (p.intent === "draft_order") {
          if (a.draft?.attempt)
            throw new Error(
              "Finish the existing order submission before preparing another draft.",
            );
          const rows = prepareCoachDraft(
            p,
            a.data.items,
            a.draft?.rows || [],
            pendingPlan.proposal,
            {
              categories: a.data.categories,
              categoriesKnown: true,
              previous: pendingPlan.previous,
              focus: pendingPlan.previous,
            },
            pendingPlan.selected,
          );
          setProposed(rows);
          setAnswer({
            title: rows.length
              ? "An order draft for your review"
              : "No supplies to add",
            text: rows.length
              ? `${rows.length} ${rows.length === 1 ? "item is" : "items are"} ready to review. Nothing has been saved and no stock has changed.`
              : "No items match this draft. Try another item or stock filter. Nothing has been saved and no stock has changed.",
            items: rows.map((r) => r.item),
            choices: [],
            timestamp: a.updatedAt,
            stale: !a.online,
            kind: "draft",
          });
        } else if (p.intent === "inventory_query" && p.selection) {
          setAnswer(
            selectionAnswer(
              evaluateSelection(p.selection, a.data.items, {
                categories: a.data.categories,
                previous: pendingPlan.previous,
                selected: pendingPlan.selected,
              }),
              p.selection,
              a.updatedAt,
              !a.online,
            ),
          );
        } else if (p.intent === "inventory_export") {
          setAnswer({
            ...answerIntent(command("summary"), a.data.items, a.updatedAt),
            title: "Your inventory report",
            text: "Use Print this list below to open a report you can print or save as PDF.",
          });
        } else if (p.intent === "review_draft") {
          if (proposed) await reviewProposal(proposed);
          else {
            a.setCoachOpen(false);
            navigate("/orders/create");
          }
        } else
          setAnswer(
            answerIntent(
              command(
                p.intent === "unsupported_action"
                  ? "unsupported_action"
                  : "clarify",
              ),
              a.data.items,
              a.updatedAt,
            ),
          );
      } else {
        if (intent.intent === "close") {
          a.setCoachOpen(false);
          return;
        }
        if (intent.intent === "stop_speaking") {
          setAnswer({
            title: "Text chat",
            text: "Ask CareKosh by typing below. Voice assistance is available in the Android app.",
            items: [],
            choices: [],
            timestamp: a.updatedAt,
            stale: false,
          });
          return;
        }
        setAnswer(
          answerIntent(
            intent,
            a.data.items,
            a.updatedAt,
            answer?.resolvedId,
            !a.online,
          ),
        );
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        if (e instanceof Clarification) {
          setPending((current) =>
            current ? { ...current, clarification: e } : null,
          );
          setAnswer({
            title: "Let’s clarify that",
            text: e.message,
            items: [],
            choices: e.choices,
            options: e.options,
            timestamp: a.updatedAt,
            stale: !a.online,
            kind: "clarify",
          });
        } else {
          setAnswer(null);
          setError((e as Error).message);
        }
      }
    } finally {
      if (!controller.signal.aborted) setWorking(false);
    }
  };
  const enableCloud = async () => {
    if (!caps || caps.consent_version !== VERSION) return;
    if (
      !(await a.confirm({
        title: "Enable online understanding?",
        body: "Questions that cannot be understood locally will be sent through CareKosh to Groq for interpretation. Questions may include supply names. Structured inventory data is not sent by this feature. This account setting also applies to Groq text understanding on Android; other voice and provider permissions are kept. You can turn it off at any time.",
        label: "Enable online understanding",
      }))
    )
      return;
    setConsentBusy(true);
    try {
      const latest = await request<Caps>("/ai/capabilities");
      const scopes = [...new Set([...latest.scopes, "groq_text"])];
      await request("/ai/consent", "PUT", {
        version: VERSION,
        accepted: true,
        scopes,
      });
      setCaps({ ...caps, consented: true, scopes });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConsentBusy(false);
    }
  };
  const disableCloud = async () => {
    if (!caps) return;
    setConsentBusy(true);
    try {
      const latest = await request<Caps>("/ai/capabilities");
      const scopes = latest.scopes.filter((s) => s !== "groq_text");
      await request("/ai/consent", "PUT", {
        version: VERSION,
        accepted: !!scopes.length,
        scopes,
      });
      setCaps({ ...caps, scopes, consented: !!scopes.length });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConsentBusy(false);
    }
  };
  return (
    <Dialog
      wide
      className="coach-dialog"
      title="Ask CareKosh"
      onClose={() => a.setCoachOpen(false)}
    >
      <div className="coach-mode">
        <span className="status-dot good" />
        {!capsChecked
          ? "Checking online settings; local commands available"
          : !DEMO && !caps
            ? "Local commands; online settings unavailable"
            : cloud
              ? caps?.interpret
                ? "Online understanding enabled"
                : "Online permission enabled; service unavailable"
              : "Local inventory understanding"}
        {caps &&
          (cloud || caps.interpret) &&
          caps.interpret_contracts.includes(3) &&
          caps.consent_version === VERSION && (
            <button
              className="text-button"
              disabled={consentBusy}
              onClick={cloud ? disableCloud : enableCloud}
            >
              {cloud ? "Turn off" : "Enable online understanding"}
            </button>
          )}
      </div>
      {!DEMO && (
        <p className="small-note">
          Online understanding uses Groq. Its permission is shared with Android;
          other providers and voice permissions are managed separately.
        </p>
      )}
      {supplyAvailable && (
        <p className="small-note">
          <Link to="/supply-review" onClick={() => a.setCoachOpen(false)}>
            Open Supply review
          </Link>{" "}
          for a recoverable, server-calculated replenishment proposal.
        </p>
      )}
      {error && <ErrorBox message={error} focus />}
      <div className="coach-conversation" aria-live="polite">
        {!answer && !working && !asked && (
          <>
            <div className="prompt-chips">
              {[
                "Give me a stock summary",
                "Show me low stock",
                "Which items are out of stock?",
                "Prepare a draft for all low-stock items",
              ].map((text) => (
                <button key={text} onClick={() => ask(text)}>
                  {text}
                  <ArrowUpRight size={14} />
                </button>
              ))}
            </div>
          </>
        )}
        {asked && <p className="user-question">{asked}</p>}
        {working ? (
          <div className="coach-thinking">
            <Spinner />
            Checking your inventory…
          </div>
        ) : (
          answer && (
            <div className="coach-answer">
              <h3 ref={answerRef} tabIndex={-1}>
                <Sparkles size={17} />
                {answer.title}
              </h3>
              <p>{answer.text}</p>
              {answer.filters && (
                <small className="muted">Filters: {answer.filters}</small>
              )}
              {answer.stale && (
                <p className="small-note">Offline · using last loaded data.</p>
              )}
              <div className="coach-results">
                {answer.items.map((i) => (
                  <Link
                    key={i.id}
                    to={`/item/${i.id}`}
                    onClick={() => a.setCoachOpen(false)}
                  >
                    <span>
                      <strong>{i.name}</strong>
                      <small>
                        {answer.kind === "draft" && proposed
                          ? `Order: ${proposed.find((r) => r.item.id === i.id)?.quantity} ${unitLabel(proposed.find((r) => r.item.id === i.id)?.quantity || 0, i.unit)}`
                          : `${i.quantity} ${unitLabel(i.quantity, i.unit)} on hand`}
                      </small>
                    </span>
                    <StockBadge item={i} />
                  </Link>
                ))}
                {answer.choices.map((i) => (
                  <button
                    key={i.id}
                    className="button secondary"
                    onClick={() =>
                      pending?.clarification
                        ? ask(asked, {
                            ...pending,
                            selected: {
                              ...pending.selected,
                              [pending.clarification.query]: i.id,
                            },
                          })
                        : ask(`Check ${i.name}`)
                    }
                  >
                    {i.name}
                  </button>
                ))}
                {answer.options?.map((option) => (
                  <button
                    key={option.id}
                    className="button secondary"
                    onClick={() =>
                      pending?.clarification &&
                      ask(asked, {
                        ...pending,
                        selected: {
                          ...pending.selected,
                          [pending.clarification.query]: option.id,
                        },
                      })
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {answer.kind === "draft" && proposed?.length ? (
                <button
                  className="button primary"
                  onClick={() => reviewProposal(proposed)}
                >
                  Review order draft
                  <ArrowUpRight size={16} />
                </button>
              ) : (
                !!answer.items.length && (
                  <div className="answer-actions">
                    <button
                      className="text-button"
                      onClick={() => {
                        try {
                          printInventory(answer.items, a.data!.categories);
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Print this list
                    </button>
                  </div>
                )
              )}
            </div>
          )
        )}
      </div>
      <form
        className="coach-input"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(q);
        }}
      >
        <textarea
          rows={2}
          aria-label="Ask CareKosh"
          maxLength={600}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type your question…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(q);
            }
          }}
        />
        <button
          type="submit"
          className="button primary"
          disabled={working || !q.trim() || !a.data}
          aria-label="Send question"
        >
          <ArrowUp size={18} />
        </button>
      </form>
      <p className="coach-footnote">
        <ShieldCheck size={13} />
        <span>
          Inventory guidance only. Stock changes always need your review.
        </span>
        <button
          className="icon-button"
          title="Refresh inventory"
          aria-label="Refresh inventory"
          onClick={() =>
            void a
              .refresh()
              .then(() => a.notify("Inventory refreshed."))
              .catch((e) => setError(e.message))
          }
        >
          <RefreshCw size={14} />
        </button>
      </p>
    </Dialog>
  );
}
