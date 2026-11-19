import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ClipboardCheck, RefreshCw, ShieldCheck } from "lucide-react";
import { useApp } from "../context";
import { DEMO, sessionEpoch } from "../services/api";
import {
  canConfirmSupply,
  groupedSupplyLines,
  supplyReview,
  type SupplyAnswer,
  type SupplyCapabilities,
  type SupplyRun,
  type SupplySummary,
} from "../services/supply-review";
import { ErrorBox, Loading, PageTitle } from "../components/ui";

const labels = {
  needs_input: "A few details to review",
  awaiting_review: "Ready for your review",
  completed: "Pending order saved",
  cancelled: "Review cancelled",
  expired: "Review expired",
  stale: "Stock or orders changed",
};
const date = (value: string) => new Date(value).toLocaleString();

export default function SupplyReview() {
  const a = useApp(),
    navigate = useNavigate(),
    { runId } = useParams();
  const [caps, setCaps] = useState<SupplyCapabilities | null>(null),
    [run, setRun] = useState<SupplyRun | null>(null);
  const [recent, setRecent] = useState<SupplySummary[]>([]),
    [working, setWorking] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [uncertain, setUncertain] = useState(false);
  const [answers, setAnswers] = useState<
    Record<string, { target: string; exclude: boolean }>
  >({});
  const [now, setNow] = useState(Date.now());
  const [dataOwner, setDataOwner] = useState(a.user?.id);
  const active = useRef(true),
    owner = useRef(a.user?.id),
    controller = useRef<AbortController | null>(null),
    lock = useRef(false);
  const runRef = useRef(run),
    heading = useRef<HTMLHeadingElement>(null),
    startKey = useRef("");
  const confirmKey = useRef<{ proposal: string; key: string } | null>(null);
  owner.current = a.user?.id;
  runRef.current = dataOwner === a.user?.id ? run : null;
  const ownerId = a.user?.id;
  useEffect(() => {
    active.current = true;
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      active.current = false;
      clearInterval(timer);
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    const c = new AbortController(),
      epoch = sessionEpoch();
    controller.current?.abort();
    controller.current = c;
    setRun(null);
    setCaps(null);
    setRecent([]);
    setDataOwner(ownerId);
    setAnswers({});
    setError("");
    setNotice("");
    setUncertain(false);
    confirmKey.current = null;
    const current = () =>
      !c.signal.aborted &&
      active.current &&
      owner.current === ownerId &&
      epoch === sessionEpoch();
    if (DEMO || !a.online) {
      setWorking(false);
      return () => c.abort();
    }
    setWorking(true);
    void (async () => {
      try {
        const available = await supplyReview.capabilities(c.signal);
        if (!current()) return;
        setCaps(available);
        if (available.supported === false) return;
        if (runId) {
          const result = await supplyReview.get(runId, c.signal);
          if (current()) setRun(result);
        } else {
          const results = await supplyReview.list(c.signal);
          if (current()) setRecent(results);
        }
      } catch (e) {
        if (current()) setError((e as Error).message);
      } finally {
        if (current()) setWorking(false);
      }
    })();
    return () => c.abort();
  }, [runId, ownerId, a.online]);
  useEffect(() => {
    if (run) heading.current?.focus({ preventScroll: true });
  }, [run?.id, run?.status]);

  const execute = async (
    action: (signal: AbortSignal, current: () => boolean) => Promise<void>,
  ) => {
    if (lock.current || !a.online || !ownerId || a.busy) return;
    const c = new AbortController(),
      epoch = sessionEpoch(),
      identity = ownerId;
    controller.current?.abort();
    controller.current = c;
    lock.current = true;
    setWorking(true);
    setError("");
    setNotice("");
    const current = () =>
      active.current &&
      !c.signal.aborted &&
      owner.current === identity &&
      epoch === sessionEpoch();
    try {
      await action(c.signal, current);
    } catch (e) {
      if (current())
        setError(
          (e as Error).message ||
            "Supply review could not finish. Check its saved status before retrying.",
        );
    } finally {
      lock.current = false;
      if (current()) setWorking(false);
    }
  };
  const accept = (value: SupplyRun) => {
    setRun(value);
    setAnswers({});
    setNow(Date.now());
  };
  const begin = () =>
    execute(async (signal, current) => {
      if (!caps?.enabled) return;
      startKey.current ||= crypto.randomUUID();
      const value = await supplyReview.start(startKey.current, signal);
      if (current()) {
        startKey.current = "";
        navigate(`/supply-review/${encodeURIComponent(value.id)}`);
      }
    });
  const check = () =>
    execute(async (signal, current) => {
      if (!runRef.current) return;
      const value = await supplyReview.get(runRef.current.id, signal);
      if (!current()) return;
      accept(value);
      if (value.status !== "awaiting_review") setUncertain(false);
      setNotice(
        value.status === "completed"
          ? "The original order was saved. Open it below; no new order was created."
          : "Saved status checked. Confirmation always revalidates current stock and orders.",
      );
    });
  const refresh = () =>
    execute(async (signal, current) => {
      if (!runRef.current || uncertain || !caps?.enabled) return;
      const value = await supplyReview.refresh(runRef.current, signal);
      if (current()) {
        accept(value);
        confirmKey.current = null;
        setNotice(
          "Current inventory and orders loaded. Review this new revision before saving.",
        );
      }
    });
  const cancel = () =>
    execute(async (signal, current) => {
      if (!runRef.current || uncertain) return;
      const value = await supplyReview.cancel(runRef.current, signal);
      if (current()) accept(value);
    });
  const answer = () =>
    execute(async (signal, current) => {
      const snapshot = runRef.current;
      if (!snapshot || !caps?.enabled || uncertain) return;
      const resolved: SupplyAnswer[] = [];
      for (const question of snapshot.questions) {
        const input = answers[question.item_id];
        if (input?.exclude)
          resolved.push({ item_id: question.item_id, exclude: true });
        else if (
          ["missing_target", "backup_target"].includes(question.code) &&
          input?.target !== undefined &&
          input.target !== ""
        ) {
          const target = Number(input.target);
          if (
            !/^\d+$/.test(input.target) ||
            !Number.isSafeInteger(target) ||
            target < 0 ||
            target > 999999
          )
            throw new Error(
              "Enter a whole target between 0 and 999,999 in the recorded unit.",
            );
          resolved.push({ item_id: question.item_id, target_quantity: target });
        }
      }
      if (!resolved.length)
        throw new Error(
          "Provide a target or explicitly exclude an item before continuing.",
        );
      const value = await supplyReview.answer(snapshot, resolved, signal);
      if (current()) {
        accept(value);
        confirmKey.current = null;
      }
    });
  const confirm = async () => {
    const reviewed = runRef.current,
      epoch = sessionEpoch(),
      identity = ownerId;
    if (
      !reviewed ||
      !caps?.enabled ||
      !canConfirmSupply(reviewed) ||
      working ||
      lock.current
    )
      return;
    const ok = await a.confirm({
      title: uncertain
        ? "Retry the original confirmation?"
        : "Save this reviewed pending order?",
      body: `${reviewed.proposal!.lines.length} item lines will be saved as a pending order. This does not increase stock, mark supplies as ordered, contact suppliers or make a purchase. Current stock and existing orders are checked again before saving.`,
      label: uncertain ? "Check & retry original" : "Confirm pending order",
    });
    if (
      !ok ||
      !active.current ||
      identity !== owner.current ||
      epoch !== sessionEpoch() ||
      runRef.current !== reviewed
    )
      return;
    await execute(async (signal, current) => {
      const latest = await supplyReview.get(reviewed.id, signal);
      if (!current()) return;
      if (latest.status === "completed") {
        accept(latest);
        setUncertain(false);
        return;
      }
      if (
        latest.version !== reviewed.version ||
        latest.proposal?.id !== reviewed.proposal?.id ||
        latest.proposal?.version !== reviewed.proposal?.version ||
        !canConfirmSupply(latest)
      ) {
        accept(latest);
        setUncertain(false);
        throw new Error(
          "This review changed or expired. Review its current status before confirming again.",
        );
      }
      const proposal = `${reviewed.id}:${reviewed.proposal!.id}:${reviewed.proposal!.version}`;
      if (confirmKey.current?.proposal !== proposal)
        confirmKey.current = { proposal, key: crypto.randomUUID() };
      setUncertain(true);
      try {
        const value = await supplyReview.confirm(
          reviewed,
          confirmKey.current.key,
          signal,
        );
        if (current()) {
          accept(value);
          setUncertain(false);
          void a.refresh().catch(() => {});
        }
      } catch (e) {
        if (!current()) return;
        try {
          const recovered = await supplyReview.get(reviewed.id, signal);
          if (!current()) return;
          accept(recovered);
          if (recovered.status === "completed") {
            setUncertain(false);
            setNotice(
              "The original pending order was saved and recovered. No duplicate was created.",
            );
            void a.refresh().catch(() => {});
            return;
          }
          if (recovered.status !== "awaiting_review") setUncertain(false);
        } catch {
          /* Retain uncertainty and the same confirmation key. */
        }
        throw e;
      }
    });
  };

  const locked = working || a.busy || !a.online;
  return (
    <>
      <PageTitle
        eyebrow="REPLENISHMENT REVIEW"
        title="Supply review"
        description="Fresh stock, existing commitments and a proposal you approve."
      />
      <section className="panel supply-intro">
        <ShieldCheck size={23} aria-hidden="true" />
        <div>
          <strong>Calculated from your own inventory</strong>
          <p>
            Python calculates quantities from recorded stock and minimum levels.
            This review sends no inventory or notes to an AI provider. An order
            is saved only after your explicit confirmation.
          </p>
        </div>
      </section>
      <nav className="supply-links" aria-label="Supply review navigation">
        <Link to="/supply-review">Recent reviews</Link>
        <Link to="/inventory">Inventory</Link>
        <Link to="/orders">Orders</Link>
      </nav>
      {!a.online && (
        <p className="supply-warning" role="status">
          You are offline. Reconnect to load authoritative stock or confirm a
          review. No changes are queued.
        </p>
      )}
      {DEMO ? (
        <section className="panel supply-intro">
          <div>
            <h2>Available with a signed-in inventory</h2>
            <p>
              This feature uses server-owned reviews and is disabled in the
              demo. The existing demo inventory and Coach remain available.
            </p>
          </div>
        </section>
      ) : dataOwner !== ownerId ? (
        <Loading />
      ) : (
        <>
          {!!error && <ErrorBox message={error} focus />}
          {!!notice && (
            <p role="status" className="supply-notice">
              {notice}
            </p>
          )}
          {working && (
            <div aria-live="polite">
              <Loading />
            </div>
          )}
          {caps && !caps.enabled && (
            <section className="panel supply-intro">
              <div>
                <h2>Supply review is not enabled here yet</h2>
                <p>
                  New reviews and proposal changes are paused. Existing review
                  results remain readable on supported backends, and unfinished
                  reviews can be cancelled. Your normal inventory, orders and
                  Coach remain available.
                </p>
              </div>
            </section>
          )}
          {caps && caps.supported !== false && !runId && (
            <section className="panel supply-start">
              <h2>Review low and out-of-stock supplies</h2>
              <p>
                Choose recorded minimum levels as the starting target. Missing
                targets, backup quantities and existing commitments are
                clarified before a proposal can be saved.
              </p>
              {caps.enabled && (
                <button
                  className="button primary"
                  disabled={locked}
                  onClick={() => void begin()}
                >
                  <ClipboardCheck size={18} /> Review to recorded minimum
                </button>
              )}
              <h3>Recent saved reviews</h3>
              <p>
                Opening a review reads its current status. It never repeats a
                save.
              </p>
              {!recent.length ? (
                <p>No reviews yet.</p>
              ) : (
                <ul className="supply-recent">
                  {recent.map((value) => (
                    <li key={value.id}>
                      <Link
                        to={`/supply-review/${encodeURIComponent(value.id)}`}
                      >
                        <strong>{labels[value.status]}</strong>
                        <span>{date(value.created_at)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {caps && run && (
            <section className="panel supply-run" aria-busy={working}>
              <div className="supply-heading">
                <div>
                  <h2 ref={heading} tabIndex={-1}>
                    {labels[run.status]}
                  </h2>
                  <p>Snapshot · {date(run.snapshot_at)}</p>
                  <p>
                    Review revision {run.proposal?.version || run.version} ·
                    expires {date(run.proposal?.expires_at || run.expires_at)}
                  </p>
                </div>
                <button
                  className="button secondary"
                  disabled={locked}
                  onClick={() => void check()}
                >
                  <RefreshCw size={16} /> Check saved result
                </button>
              </div>
              {uncertain && (
                <p className="supply-warning" role="alert">
                  The save outcome was not confirmed. Check the saved result or
                  retry the original confirmation. Avoid starting a replacement
                  order until this outcome is resolved.
                </p>
              )}
              {(["expired", "stale"].includes(run.status) ||
                (["needs_input", "awaiting_review"].includes(run.status) &&
                  Date.parse(run.expires_at) <= now)) && (
                <p className="supply-warning">
                  This proposal cannot be confirmed. Load a fresh revision and
                  review the changed stock and commitments.
                </p>
              )}
              {run.status === "completed" && run.order_id && (
                <div className="supply-notice">
                  <strong>Saved as {run.order_id}</strong>
                  <p>
                    It is a pending request. Receiving supplies and applying
                    stock remain separate manual steps.
                  </p>
                  <Link
                    className="button primary"
                    to={`/orders/${encodeURIComponent(run.order_id)}`}
                  >
                    Open saved order
                  </Link>
                </div>
              )}
              {!!run.questions.length && run.status === "needs_input" && (
                <form
                  className="supply-questions"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void answer();
                  }}
                >
                  <h3>Clarify before continuing</h3>
                  <p>
                    Review all details, then submit them together in one
                    revision.
                  </p>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={locked || !caps.enabled || uncertain}
                    onClick={() =>
                      setAnswers(
                        Object.fromEntries(
                          run.questions.map((q) => [
                            q.item_id,
                            {
                              target: answers[q.item_id]?.target || "",
                              exclude: true,
                            },
                          ]),
                        ),
                      )
                    }
                  >
                    Exclude all unresolved items
                  </button>
                  {run.questions.map((question) => {
                    const input = answers[question.item_id] || {
                      target: "",
                      exclude: false,
                    };
                    const editable = [
                      "missing_target",
                      "backup_target",
                    ].includes(question.code);
                    return (
                      <fieldset
                        key={question.item_id}
                        disabled={locked || !caps.enabled || uncertain}
                      >
                        <legend>{question.name}</legend>
                        <p>{question.message}</p>
                        {editable ? (
                          <label htmlFor={`supply-target-${question.item_id}`}>
                            Target stock ({question.unit})
                            <input
                              id={`supply-target-${question.item_id}`}
                              type="number"
                              inputMode="numeric"
                              min="0"
                              max="999999"
                              step="1"
                              value={input.target}
                              disabled={input.exclude || locked}
                              onChange={(event) =>
                                setAnswers((prev) => ({
                                  ...prev,
                                  [question.item_id]: {
                                    ...input,
                                    target: event.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                        ) : (
                          <p>
                            Resolve this through your{" "}
                            <Link to="/orders">normal order workflow</Link>,
                            then refresh; or exclude it from this review.
                          </p>
                        )}
                        <label className="supply-exclude">
                          <input
                            type="checkbox"
                            checked={input.exclude}
                            onChange={(event) =>
                              setAnswers((prev) => ({
                                ...prev,
                                [question.item_id]: {
                                  ...input,
                                  exclude: event.target.checked,
                                },
                              }))
                            }
                          />{" "}
                          Exclude {question.name} from this proposal
                        </label>
                      </fieldset>
                    );
                  })}
                  <button
                    className="button primary"
                    disabled={locked || !caps.enabled || uncertain}
                    type="submit"
                  >
                    Review these answers
                  </button>
                </form>
              )}
              {run.proposal && (
                <div className="supply-proposal">
                  <h3>
                    Proposed replenishment · {run.proposal.lines.length} item
                    lines
                  </h3>
                  {!run.proposal.lines.length && !run.questions.length ? (
                    <p>
                      No replenishment needed for the resolved items at the
                      approved targets.
                    </p>
                  ) : (
                    groupedSupplyLines(run.proposal.lines).map(
                      ([supplier, lines]) => (
                        <section className="supply-group" key={supplier}>
                          <h4>{supplier}</h4>
                          <p className="supply-table-hint">
                            Scroll the table horizontally to compare all
                            quantities.
                          </p>
                          <div
                            className="supply-table-wrap"
                            role="region"
                            aria-label={`${supplier} proposal quantities`}
                            tabIndex={0}
                          >
                            <table className="supply-table">
                              <caption>
                                Recorded unit and reason are shown for every
                                item.
                              </caption>
                              <thead>
                                <tr>
                                  <th scope="col">Item / reason</th>
                                  <th scope="col">On hand</th>
                                  <th scope="col">Minimum</th>
                                  <th scope="col">Known inbound</th>
                                  <th scope="col">Target</th>
                                  <th scope="col">Proposed order</th>
                                </tr>
                              </thead>
                              <tbody>
                                {lines.map((line) => (
                                  <tr key={line.item_id}>
                                    <th scope="row">
                                      <strong>{line.name}</strong>
                                      <small>{line.unit}</small>
                                      <small className="supply-mobile-order">
                                        Proposed order: {line.order_quantity}{" "}
                                        {line.unit}
                                      </small>
                                      <ul>
                                        {line.reasons.map((reason, index) => (
                                          <li key={index}>{reason}</li>
                                        ))}
                                      </ul>
                                    </th>
                                    <td>{line.on_hand}</td>
                                    <td>{line.minimum_stock}</td>
                                    <td>{line.known_inbound}</td>
                                    <td>{line.target_quantity}</td>
                                    <td>
                                      <strong>
                                        {line.order_quantity} {line.unit}
                                      </strong>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </section>
                      ),
                    )
                  )}
                  <button
                    className="button primary"
                    disabled={
                      locked || !caps.enabled || !canConfirmSupply(run, now)
                    }
                    onClick={() => void confirm()}
                  >
                    {uncertain
                      ? "Retry original confirmation"
                      : "Review & confirm pending order"}
                  </button>
                  <p className="supply-muted">
                    Saving does not change stock or purchase supplies. The
                    server revalidates this exact proposal and prevents
                    duplicate confirmation.
                  </p>
                </div>
              )}
              {!!run.excluded.length && (
                <details className="supply-exclusions">
                  <summary>Excluded items ({run.excluded.length})</summary>
                  <ul>
                    {run.excluded.map((row) => (
                      <li key={row.item_id}>
                        <strong>{row.name}</strong> · {row.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {!["completed", "cancelled"].includes(run.status) && (
                <div className="supply-actions">
                  <button
                    className="button secondary"
                    disabled={locked || uncertain || !caps.enabled}
                    onClick={() => void refresh()}
                  >
                    Refresh stock & review again
                  </button>
                  <button
                    className="button secondary"
                    disabled={locked || uncertain}
                    onClick={() => void cancel()}
                  >
                    Cancel review
                  </button>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
