"""Pure integer business rules. No model, database, clinical or conversion logic."""

from dataclasses import dataclass

RULES_VERSION = "supply-review-1"


@dataclass(frozen=True)
class SupplyFact:
    item_id: str
    version: int
    name: str
    unit: str
    supplier_name: str | None
    quantity: int
    minimum_stock: int
    is_critical: bool


@dataclass(frozen=True)
class InboundFact:
    item_id: str
    unit: str
    quantity: int
    status: str


def replenishment_quantity(on_hand: int, target: int, known_inbound: int) -> int:
    if any(type(v) is not int or v < 0 for v in (on_hand, target, known_inbound)):
        raise ValueError("Supply quantities must be nonnegative integers")
    if on_hand > 2_147_483_647 or target > 999999 or known_inbound > 2_147_483_647:
        raise ValueError("Supply quantity is out of range")
    return max(0, target - on_hand - known_inbound)


def unit_key(unit: str) -> str:
    # Same comparison as stock application. Boxes/pieces are never converted.
    return unit.strip(" ").lower()


def review_facts(items: list[SupplyFact], inbound: list[InboundFact], answers: dict) -> dict:
    by_item: dict[str, list[InboundFact]] = {}
    for fact in inbound:
        if type(fact.quantity) is not int or not 0 < fact.quantity <= 2_147_483_647 or fact.status not in {"pending", "ordered", "partially_received", "received", "stock_updated", "declined"}:
            raise ValueError("Invalid recorded order fact")
        by_item.setdefault(fact.item_id, []).append(fact)
    lines, questions, excluded = [], [], []
    for item in sorted(items, key=lambda i: ((i.supplier_name or "").casefold(), i.name.casefold(), i.item_id)):
        if any(type(v) is not int or not 0 <= v <= 2_147_483_647 for v in (item.quantity, item.minimum_stock)):
            raise ValueError("Invalid recorded stock fact")
        eligible = item.quantity == 0 or 0 < item.quantity < item.minimum_stock or item.is_critical and item.quantity == 1
        if not eligible:
            continue
        answer = answers.get(item.item_id, {})
        if answer.get("exclude") is True:
            excluded.append({"item_id": item.item_id, "name": item.name, "reason": "Excluded by your review"})
            continue
        known, blocked = 0, None
        commitments = by_item.get(item.item_id, [])
        for fact in commitments:
            if fact.status in {"stock_updated", "declined"}:
                continue
            if not unit_key(item.unit) or unit_key(fact.unit) != unit_key(item.unit):
                blocked = ("unit_mismatch", "An outstanding order uses a different unit. Reconcile it in Orders or exclude this item.")
                break
            if fact.status == "pending":
                blocked = ("pending_commitment", "A saved pending request already contains this item. Reconcile it in Orders or exclude this item.")
                break
            if fact.status == "partially_received":
                blocked = ("partial_receipt", "The remaining quantity of a partial receipt is unknown. Reconcile it in Orders or exclude this item.")
                break
            if fact.status == "received":
                blocked = ("received_not_applied", "Received stock has not been applied. Reconcile it in Orders or exclude this item.")
                break
            if fact.status == "ordered":
                known += fact.quantity
        target = answer.get("target_quantity")
        if not blocked and not unit_key(item.unit):
            blocked = ("unit_mismatch", "This item has no usable recorded unit. Correct it in Inventory or exclude it.")
        if not blocked and target is None:
            if item.minimum_stock <= 0:
                blocked = ("missing_target", "No positive minimum is recorded. Choose your own target quantity or exclude this item.")
            elif item.is_critical and item.quantity == 1 and item.quantity >= item.minimum_stock:
                blocked = ("backup_target", "This item meets its minimum and is marked critical. Choose a backup target yourself or exclude it.")
            else:
                target = item.minimum_stock
        if blocked:
            questions.append({"item_id": item.item_id, "name": item.name, "unit": item.unit, "code": blocked[0], "message": blocked[1]})
            continue
        amount = replenishment_quantity(item.quantity, target, known)
        if not amount:
            excluded.append({"item_id": item.item_id, "name": item.name, "reason": "Approved target is covered by on-hand and recorded ordered supplies"})
            continue
        reasons = ["Out of stock" if item.quantity == 0 else "Below recorded minimum" if item.quantity < item.minimum_stock else "User-selected backup target", "Target chosen by you" if "target_quantity" in answer else "Target: recorded minimum selected for this review"]
        if known:
            reasons.append(f"Subtracts {known} {item.unit} recorded as ordered; supplier delivery is not independently verified")
        lines.append({"item_id": item.item_id, "item_version": item.version, "name": item.name, "unit": item.unit, "supplier_name": item.supplier_name,
                      "on_hand": item.quantity, "minimum_stock": item.minimum_stock, "known_inbound": known, "target_quantity": target, "order_quantity": amount, "reasons": reasons})
    return {"lines": lines, "questions": questions, "excluded": excluded}
