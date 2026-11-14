"""Request-driven durable supply review, with no external model or background job.

Every write uses the authenticated owner's supply row before a run row. All
business effects and approval metadata share the caller's SQL transaction.
"""

from datetime import datetime, timedelta, timezone
import hashlib
import json
from uuid import NAMESPACE_URL, uuid5

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only, noload

from app.core.config import settings
from app.models import Item, Order, OrderItem, OrderStatus
from app.models.supply_review import SupplyRevision, SupplyReviewConfirmation, SupplyReviewProposal, SupplyReviewRun
from app.schemas.order import OrderCreate, OrderItemCreate
from app.schemas.supply_review import AnswerReview, ConfirmReview, ReviewRun, StartReview
from app.services.audit import log_audit
from app.services.orders import create_order_uncommitted
from app.services.supply_revision import lock_supply_revision
from app.services.supply_rules import RULES_VERSION, InboundFact, SupplyFact, review_facts

ACTIVE = ("needs_input", "awaiting_review", "stale")
MAX_OUTSTANDING_LINES = 5000


def require_enabled():
    if not settings.SUPPLY_REVIEW_ENABLED:
        raise HTTPException(503, "Supply review is unavailable. Normal inventory and order screens remain available.")


def now():
    return datetime.now(timezone.utc)


async def snapshot(db: AsyncSession, owner: str):
    items = (await db.execute(select(Item).options(noload("*"), load_only(
        Item.id, Item.user_id, Item.version, Item.name, Item.unit, Item.supplier_name,
        Item.quantity, Item.minimum_stock, Item.is_critical, Item.brand, Item.image_uri, Item.purchase_link,
    )).where(Item.user_id == owner, Item.is_active.is_(True))
                             .order_by(Item.id).limit(settings.SUPPLY_REVIEW_MAX_ITEMS + 1))).scalars().all()
    if len(items) > settings.SUPPLY_REVIEW_MAX_ITEMS:
        raise HTTPException(422, "Too many active items for a complete supply review. Use normal Inventory to narrow or reconcile your stock.")
    rows = (await db.execute(select(Order.id, Order.status, OrderItem.id.label("line_id"),
                            OrderItem.item_id, OrderItem.unit, OrderItem.quantity).join(OrderItem, OrderItem.order_id == Order.id)
                            .where(Order.user_id == owner, Order.status.in_([OrderStatus.PENDING, OrderStatus.ORDERED, OrderStatus.PARTIALLY_RECEIVED, OrderStatus.RECEIVED]),
                                   OrderItem.item_id.in_([i.id for i in items]))
                            .order_by(Order.id, OrderItem.id).limit(MAX_OUTSTANDING_LINES + 1))).all()
    if len(rows) > MAX_OUTSTANDING_LINES:
        raise HTTPException(422, "Too many outstanding order lines for a complete supply review. Reconcile older orders first.")
    facts = [SupplyFact(i.id, i.version, i.name, i.unit, i.supplier_name, i.quantity, i.minimum_stock, i.is_critical) for i in items]
    incoming = [InboundFact(row[3], row[4], row[5], row[1].value) for row in rows]
    # Detect changed source content too, without exposing notes/contact data.
    digest = hashlib.sha256(json.dumps({
        "items": [[i.id, i.version, i.name, i.unit, i.supplier_name, i.quantity, i.minimum_stock, i.is_critical] for i in items],
        "orders": [[row[0], row[1].value, *row[2:]] for row in rows],
    }, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return items, facts, incoming, digest


async def owned_run(db: AsyncSession, owner: str, run_id: str, *, lock=False):
    query = select(SupplyReviewRun).where(SupplyReviewRun.user_id == owner, SupplyReviewRun.id == run_id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    row = (await db.execute(query)).scalar_one_or_none()
    if row is None:
        raise HTTPException(404, "Supply review not found")
    return row


async def latest_proposal(db: AsyncSession, run: SupplyReviewRun):
    return (await db.execute(select(SupplyReviewProposal).where(SupplyReviewProposal.run_id == run.id,
                            SupplyReviewProposal.user_id == run.user_id, SupplyReviewProposal.version == run.proposal_version))).scalar_one_or_none()


def public_status(run: SupplyReviewRun, revision: int | None) -> str:
    state = run.status
    if state in ACTIVE:
        if run.expires_at <= now():
            state = "expired"
        else:
            if revision != run.supply_revision or run.rules_version != RULES_VERSION:
                state = "stale"
    return state


async def serialize(db: AsyncSession, run: SupplyReviewRun) -> ReviewRun:
    proposal = await latest_proposal(db, run)
    revision = await db.scalar(select(SupplyRevision.revision).where(SupplyRevision.user_id == run.user_id))
    state = public_status(run, revision)
    payload = proposal.payload if proposal else {}
    if state in ACTIVE and payload.get("rules_version") != RULES_VERSION:
        state = "stale"
    return ReviewRun(id=run.id, version=run.version, status=state, created_at=run.created_at,
                     expires_at=run.expires_at, snapshot_at=run.snapshot_at, supply_revision=run.supply_revision,
                     proposal={"id": proposal.id, "version": proposal.version, "expires_at": proposal.expires_at,
                               "lines": payload.get("lines", [])} if proposal else None,
                     questions=payload.get("questions", []), excluded=payload.get("excluded", []), order_id=run.order_id)


async def rebuild(db: AsyncSession, run: SupplyReviewRun, revision: int):
    if run.proposal_version >= 10:
        raise HTTPException(422, "This review reached ten proposal revisions. Start a new review.")
    _, facts, inbound, fingerprint = await snapshot(db, run.user_id)
    try:
        payload = review_facts(facts, inbound, run.answers)
    except ValueError:
        raise HTTPException(422, "A recorded quantity is outside the supported range. Reconcile it in Inventory or Orders.") from None
    payload["fingerprint"] = fingerprint
    payload["rules_version"] = RULES_VERSION
    run.snapshot_at = now()
    run.supply_revision = revision
    run.proposal_version += 1
    run.rules_version = RULES_VERSION
    run.status = "needs_input" if payload["questions"] else "awaiting_review"
    db.add(SupplyReviewProposal(user_id=run.user_id, run_id=run.id, version=run.proposal_version,
                              expires_at=run.expires_at, payload=payload))
    await db.flush()


async def start(db: AsyncSession, owner: str, data: StartReview):
    require_enabled()
    revision = await lock_supply_revision(db, owner)
    existing = (await db.execute(select(SupplyReviewRun).where(SupplyReviewRun.user_id == owner,
                               SupplyReviewRun.request_id == str(data.request_id)))).scalar_one_or_none()
    if existing:
        return await serialize(db, existing)
    active = await db.scalar(select(func.count()).select_from(SupplyReviewRun).where(
        SupplyReviewRun.user_id == owner, SupplyReviewRun.status.in_(ACTIVE), SupplyReviewRun.expires_at > now()))
    if active >= 20:
        raise HTTPException(429, "You have 20 open supply reviews. Cancel older reviews before starting another.")
    stamp = now()
    run = SupplyReviewRun(user_id=owner, request_id=str(data.request_id), version=1, status="needs_input",
                          created_at=stamp, expires_at=stamp + timedelta(seconds=settings.SUPPLY_REVIEW_TTL_SECONDS),
                          snapshot_at=stamp, supply_revision=revision.revision, proposal_version=0, answers={}, rounds=0)
    db.add(run)
    await db.flush()
    await rebuild(db, run, revision.revision)
    return await serialize(db, run)


def check_change(run: SupplyReviewRun, expected: int, *, refresh=False):
    if run.status == "completed":
        raise HTTPException(409, "This review already created an order. Open its saved result.")
    if run.status == "cancelled":
        raise HTTPException(409, "This review was cancelled. Start a new review.")
    if run.expires_at <= now():
        raise HTTPException(410, "This review expired. Start a new review and approve its current quantities.")
    if run.version != expected:
        raise HTTPException(409, "This review changed in another window. Reload and review it again.")
    if not refresh and run.status == "stale":
        raise HTTPException(409, "Supply data changed. Refresh this review before continuing.")


async def answer(db: AsyncSession, owner: str, run_id: str, data: AnswerReview):
    require_enabled()
    revision = await lock_supply_revision(db, owner)
    run = await owned_run(db, owner, run_id, lock=True)
    check_change(run, data.expected_run_version)
    if revision.revision != run.supply_revision:
        raise HTTPException(409, "Inventory or outstanding orders changed. Refresh and review again.")
    if run.rounds >= 9:
        raise HTTPException(422, "This review has reached nine clarification rounds. Start a new review.")
    proposal = await latest_proposal(db, run)
    offered = {q["item_id"]: q["code"] for q in proposal.payload["questions"]}
    offered.update({line["item_id"]: "line" for line in proposal.payload["lines"]})
    answers = dict(run.answers)
    for value in data.answers:
        code = offered.get(value.item_id)
        if code is None:
            raise HTTPException(422, "Answer only an item in the current review.")
        if not value.exclude and code not in {"missing_target", "backup_target", "line"}:
            raise HTTPException(422, "Reconcile the existing order or unit in normal screens, or exclude this item. A target cannot override it.")
        answers[value.item_id] = value.model_dump(exclude_none=True, exclude={"item_id"})
    run.answers = answers
    run.rounds += 1
    run.version += 1
    await rebuild(db, run, revision.revision)
    return await serialize(db, run)


async def refresh(db: AsyncSession, owner: str, run_id: str, expected: int):
    require_enabled()
    revision = await lock_supply_revision(db, owner)
    run = await owned_run(db, owner, run_id, lock=True)
    check_change(run, expected, refresh=True)
    # New source requires new review; old per-item choices cannot silently transfer.
    run.answers = {}
    run.rounds = 0
    run.version += 1
    await rebuild(db, run, revision.revision)
    return await serialize(db, run)


async def cancel(db: AsyncSession, owner: str, run_id: str, expected: int):
    # Cancellation and reading remain available when new reviews are disabled.
    await lock_supply_revision(db, owner)
    run = await owned_run(db, owner, run_id, lock=True)
    if run.status in {"completed", "cancelled"}:
        return await serialize(db, run)
    if run.version != expected:
        raise HTTPException(409, "This review changed. Reload before cancelling.")
    run.status = "cancelled"
    run.version += 1
    return await serialize(db, run)


async def confirm(db: AsyncSession, owner: str, run_id: str, data: ConfirmReview):
    require_enabled()
    revision = await lock_supply_revision(db, owner)
    run = await owned_run(db, owner, run_id, lock=True)
    prior = (await db.execute(select(SupplyReviewConfirmation).where(SupplyReviewConfirmation.user_id == owner,
                             SupplyReviewConfirmation.idempotency_key == str(data.idempotency_key)))).scalar_one_or_none()
    if prior and (prior.run_id != run.id or prior.proposal_id != str(data.proposal_id)):
        raise HTTPException(409, "This confirmation key belongs to a different proposal.")
    proposal = await latest_proposal(db, run)
    if proposal is None or proposal.id != str(data.proposal_id) or proposal.version != data.proposal_version:
        raise HTTPException(409, "That proposal revision is no longer current. Reload and review again.")
    if run.status == "completed":
        if not prior:
            db.add(SupplyReviewConfirmation(user_id=owner, run_id=run.id, proposal_id=proposal.id,
                                           idempotency_key=str(data.idempotency_key), order_id=run.order_id, created_at=now()))
        return await serialize(db, run)
    check_change(run, data.expected_run_version)
    if run.status != "awaiting_review" or proposal.payload["questions"]:
        raise HTTPException(409, "Resolve all questions and review the proposal before confirming.")
    if proposal.payload.get("rules_version") != RULES_VERSION:
        raise HTTPException(409, "Supply review rules changed. Refresh and review the proposal again.")
    if proposal.expires_at <= now() or revision.revision != run.supply_revision:
        raise HTTPException(409, "Inventory or outstanding orders changed. Refresh and review the proposal again.")
    items, _, _, fingerprint = await snapshot(db, owner)
    if fingerprint != proposal.payload["fingerprint"]:
        raise HTTPException(409, "The source records changed. Refresh and review the proposal again.")
    if not proposal.payload["lines"]:
        raise HTTPException(422, "No replenishment is needed. There is no order to save.")
    indexed = {i.id: i for i in items}
    lines = []
    for line in proposal.payload["lines"]:
        item = indexed.get(line["item_id"])
        if item is None or item.version != line["item_version"] or item.unit != line["unit"]:
            raise HTTPException(409, "An item changed. Refresh and review again.")
        lines.append(OrderItemCreate(item_id=item.id, name=item.name, brand=item.brand, unit=item.unit,
                                     quantity=line["order_quantity"], current_stock=item.quantity,
                                     minimum_stock=item.minimum_stock, image_uri=item.image_uri,
                                     supplier_name=item.supplier_name, purchase_link=item.purchase_link,
                                     expected_version=item.version))
    submission = str(uuid5(NAMESPACE_URL, f"carekosh:supply:{owner}:{proposal.id}:{proposal.version}"))
    order, _ = await create_order_uncommitted(db, owner, OrderCreate(order_id="SERVER-ALLOCATED", local_id=submission,
                                           items=lines, notes="Explicitly confirmed supply review"))
    run.order_id = order.order_id
    run.status = "completed"
    run.version += 1
    db.add(SupplyReviewConfirmation(user_id=owner, run_id=run.id, proposal_id=proposal.id,
                                   idempotency_key=str(data.idempotency_key), order_id=order.order_id, created_at=now()))
    await log_audit(db, owner, "supply_review", run.id, "confirm", new_values={"proposal_id": proposal.id,
                    "proposal_version": proposal.version, "order_id": order.order_id})
    await db.flush()
    return await serialize(db, run)
