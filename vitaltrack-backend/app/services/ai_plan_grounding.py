"""Conservative lexical checks for v3 plans, before deterministic phone execution.

This is a validation boundary, not another natural-language interpreter. Detectable
conditions must be retained and associated with their own clause; uncertain wording
fails closed. It neither knows inventory nor permits a server mutation.
"""

import re

from app.schemas.ai import Plan

NUMBER_WORDS = dict(zip(
    "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety".split(),
    [*range(0, 21), *range(30, 100, 10)], strict=True,
))
NUMBER_PATTERN = r"\b(?:(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[ -](?:one|two|three|four|five|six|seven|eight|nine))?|" + "|".join(list(NUMBER_WORDS)[:20]) + r")\b"
EXCLUSION = r"(?:excluding|exclude|except|other than|apart from|but not|not including|leaving out|leave out|minus|omit|omitting|skip|skipping)"
COMPARISONS = {
    "lt": (r"(?:less|fewer|lower) than (\d+)", r"(?:under|below) (\d+)"),
    "lte": (r"(?:at most|no more than|not more than|up to|a maximum of|maximum of) (\d+)", r"(\d+) or (?:fewer|less|below|under)"),
    "eq": (r"(?:exactly|equal to|equals|precisely|only) (\d+)", r"(?:with|having|have|has) (\d+)(?: \w+)? (?:left|remaining|in stock|on hand)"),
    "gte": (r"(?:at least|no less than|not less than|a minimum of|minimum of) (\d+)", r"(\d+) or (?:more|above|over|greater)"),
    "gt": (r"(?:more|greater) than (\d+)", r"(?:over|above) (\d+)"),
}
PRIORITY = r"\b(?:order priority|most urgent|order (?:now|immediately)|ordering (?:now|immediately)|should (?:i |we )?order|consider ordering)\b"
MISSING_SUPPLIER = r"\b(?:(?:no|missing|without)(?: a| any| recorded)? supplier|supplier(?: is| has)? (?:not recorded|not set|missing|unrecorded))\b"


def words(value: str) -> str:
    return " ".join(re.findall(r"\w+", value.casefold()))


def numeric_text(question: str) -> str:
    return re.sub(NUMBER_PATTERN, lambda m: str(sum(NUMBER_WORDS[w] for w in re.split(r"[ -]", m.group()))), question.casefold())


def require_representable_numbers(question: str, names=()) -> None:
    """Reject lossy numeric normalization, allowing opaque copied recorded names."""
    raw = question.casefold()
    for name in sorted((name.casefold() for name in names if name), key=len, reverse=True):
        raw = re.sub(rf"(?<!\w){re.escape(name)}(?!\w)", "recorded_name", raw)
    if re.search(r"(?<!\w)[+−-]\s*(?:\d|" + NUMBER_PATTERN + r")|[+−-]\s*zero\b|\b\d+(?:\.\d+|\s*/\s*\d+|[eE][+−-]?\d+)|\b\d{1,3}(?:,\d{3})+\b|\b(?:minus|negative)\s+(?:\d|" + NUMBER_PATTERN + r")|\b(?:hundred|thousand|million|billion|half|quarter)\b", raw):
        raise ValueError("Unsupported numeric wording")


def comparisons(text: str) -> set[tuple[str, int]]:
    result = set()
    for match in re.finditer(r"\bbetween (\d+) and (\d+)\b", text):
        result.update({("gte", int(match[1])), ("lte", int(match[2]))})
    # More-specific cues claim their span first: 'no less than' must not become lt.
    occupied = []
    for op in ("lte", "gte", "eq", "lt", "gt"):
        for pattern in COMPARISONS[op]:
            for match in re.finditer(rf"\b{pattern}\b", text):
                if any(match.start() < end and start < match.end() for start, end in occupied):
                    continue
                occupied.append(match.span())
                result.add((op, int(match[1])))
    return result


def stock_states(text: str) -> set[str]:
    result = set()
    # Consume phrases before detecting in_stock, which must not match low in stock.
    patterns = (
        (r"\blow (?:or|and) out of stock\b", {"low", "out"}),
        (r"\b(?:out of stock|zero stock|0 stock)\b", {"out"}),
        (r"\bbelow (?:their |the |its )?(?:recorded )?minimum(?: stock)?(?: levels?)?\b", {"below_minimum"}),
        (r"\b(?:running low|low on stock|low in stock|low stock|low)\b", {"low"}),
        (r"\b(?:in stock|well stocked)\b", {"in_stock"}),
    )
    for pattern, states in patterns:
        if re.search(pattern, text):
            result.update(states)
            text = re.sub(pattern, " ", text)
    if re.search(PRIORITY, text):
        result.update({"low", "out"})
    return result


def critical_values(text: str) -> set[bool]:
    result = set()
    negative = r"\b(?:non critical|not critical|not marked critical|not flagged critical)\b"
    if re.search(negative, text):
        result.add(False)
        text = re.sub(negative, " ", text)
    if re.search(r"\bcritical\b", text):
        result.add(True)
    return result


def clauses(text: str) -> list[str]:
    # 'and' inside ranges and combined stock states is not a new selection group.
    protected = re.sub(r"\bbetween (\d+) and (\d+)\b", r"between \1 __range_and__ \2", text)
    protected = re.sub(r"\blow (and|or) out of stock\b", r"low __stock_\1__ out of stock", protected)
    # Keep stock-status lists ('low stock and out of stock') in the same clause.
    protected = re.sub(r"\b(low (?:in )?stock|running low) (and|or) (out of stock)\b", r"\1 __stock_\2__ \3", protected)
    # '3 or more/fewer' is a comparison, not an additional selection group.
    protected = re.sub(r"\b(\d+) or (more|fewer|less|below|under|above|over|greater)\b", r"\1 __quantity_or__ \2", protected)
    values = re.split(r"\b(?:and|or|plus|also)\b|[;,!?]", protected)
    return [re.sub(r"__(?:range_and|stock_and)__", "and", re.sub(r"__(?:stock_or|quantity_or)__", "or", part)).strip() for part in values if part.strip()]


def scoped_text(text: str) -> tuple[str, str]:
    match = re.search(rf"\b{EXCLUSION}\b", text)
    if match is None:
        return text, ""
    # Re-inclusion after an exclusion needs a richer ordered contract; do not
    # accidentally treat requested items after 'but include' as exclusions.
    if re.search(r"\b(?:but include|but also|then include|and include|also include|plus include)\b", text[match.end():]):
        raise ValueError("Ambiguous exclusion scope")
    return text[:match.start()], text[match.start():]


def _condition_atoms(group) -> tuple[set, set, set, bool]:
    return (set(group.stock), {(c.op, c.value) for c in group.quantity},
            set() if group.critical is None else {group.critical}, group.missing_supplier)


def require_lexical_constraints(plan: Plan, question: str) -> None:
    if plan.intent in {"clarify", "unsupported_action"}:
        return
    # _words() removes signs, decimal punctuation and fractions. Never let that
    # turn an unrepresentable quantity into a different positive integer.
    names = [line.item_query for line in plan.draft.lines if line.item_query] if plan.draft else []
    if plan.selection:
        names += [name for group in [*plan.selection.any_of, *plan.selection.exclude]
                  for name in [*group.item_queries, group.category, group.supplier, group.brand] if name]
    require_representable_numbers(question, names)
    text = words(numeric_text(question))
    opaque = " ".join(re.findall(r"\w+|[;,!?]", numeric_text(question)))
    for name in names:
        opaque = re.sub(rf"\b{re.escape(words(numeric_text(name)))}\b", "recorded_name", opaque)
    if re.search(r"\b(?:last (?:week|month|year)|next (?:week|month|year)|used (?:last|today|yesterday)|usage|forecast|expiry|expiration|expires|cheapest|prices?)\b", opaque):
        raise ValueError("Unsupported condition")
    if re.search(r"\b(?:not|no) (?:low(?: (?:in|on))? stock|out of stock|below|under)\b", opaque):
        raise ValueError("Unrepresented stock negation")
    if plan.draft is not None:
        if not re.search(r"\b(?:draft|order|purchase)\b", text) and not (
            plan.draft.mode == "edit" and re.search(r"\b(?:add|set|remove|change|increase|reduce)\b", text)
        ):
            raise ValueError("Draft action not requested")
        for line in plan.draft.lines:
            if line.operation == "add" and not re.search(r"\b(?:add|increase|more)\b", text):
                raise ValueError("Add not requested")
            if line.operation == "remove" and not re.search(r"\b(?:remove|take out|leave out|delete)\b", text):
                raise ValueError("Remove not requested")
            if line.target == "previous" and line.operation == "set" and not re.search(r"\b(?:set|change|replace|make|quantity to)\b", text):
                raise ValueError("Set not requested")
    if plan.selection is None:
        if comparisons(opaque) or stock_states(opaque) or critical_values(opaque) or re.search(MISSING_SUPPLIER, opaque):
            raise ValueError("Selection condition omitted")
        return

    # Names can contain words such as Critical or Low Stock. Treat explicit
    # recorded-name filters as opaque when checking unrelated stock/critical cues.
    included, excluded = scoped_text(opaque)
    for groups, scope_text, exclusion in ((plan.selection.any_of, included, False), (plan.selection.exclude, excluded, True)):
        if groups and exclusion and not re.search(rf"\b{EXCLUSION}\b", text):
            raise ValueError("Exclusion not requested")
        expected_stock = stock_states(scope_text)
        expected_quantity = comparisons(scope_text)
        expected_critical = critical_values(scope_text)
        expected_missing = bool(re.search(MISSING_SUPPLIER, scope_text))
        if any(group.empty() for group in groups) and (expected_stock or expected_quantity or expected_critical or expected_missing):
            raise ValueError("Unrestricted group broadens the requested filters")
        actual_stock, actual_quantity, actual_critical = set(), set(), set()
        actual_missing = False
        for group in groups:
            states, amounts, critical, missing = _condition_atoms(group)
            if not states <= expected_stock or not amounts <= expected_quantity or not critical <= expected_critical or missing and not expected_missing:
                raise ValueError("Condition not requested")
            actual_stock.update(states)
            actual_quantity.update(amounts)
            actual_critical.update(critical)
            actual_missing |= missing
            if sum(bool(value) for value in (states, amounts, critical, missing)) >= 2 and not any(
                states <= stock_states(part) and amounts <= comparisons(part)
                and critical <= critical_values(part)
                and (not missing or re.search(MISSING_SUPPLIER, part))
                for part in clauses(scope_text)
            ):
                raise ValueError("Separate clauses were conjoined")
            # Multiple named groups cannot borrow one another's thresholds. Keep
            # the raw name text for association, even if it is opaque above.
            anchors = [*group.item_queries, *[name for name in (group.category, group.supplier, group.brand) if name]]
            if anchors and (states or amounts or critical or missing):
                raw_with_boundaries = " ".join(re.findall(r"\w+|[;,!?]", numeric_text(question)))
                raw_scope = scoped_text(raw_with_boundaries)[int(exclusion)]
                for anchor in anchors:
                    matching = [part for part in clauses(raw_scope) if re.search(rf"\b{re.escape(words(numeric_text(anchor)))}\b", part)]
                    for name in names:
                        matching = [re.sub(rf"\b{re.escape(words(numeric_text(name)))}\b", "recorded_name", part) for part in matching]
                    if not matching or not any(
                        states <= stock_states(part) and amounts <= comparisons(part)
                        and critical <= critical_values(part)
                        and (not missing or re.search(MISSING_SUPPLIER, part))
                        for part in matching
                    ):
                        raise ValueError("Condition belongs to another clause")
        if expected_stock != actual_stock or expected_quantity != actual_quantity or expected_critical != actual_critical or expected_missing != actual_missing:
            raise ValueError("Explicit condition omitted")
        # A conjunction inside one clause must not become a broader union. Two
        # separate fields ('critical items that are low', 'low stock below 3')
        # must hold together. Stock values alone are OR and can use split groups.
        for part in clauses(scope_text):
            states = stock_states(part)
            amounts = comparisons(part)
            critical = critical_values(part)
            missing = bool(re.search(MISSING_SUPPLIER, part))
            if sum(bool(value) for value in (states, amounts, critical, missing)) < 2:
                continue
            candidates = [group for group in groups if set(group.stock) & states or {(c.op, c.value) for c in group.quantity} & amounts or group.critical in critical or missing and group.missing_supplier]
            for group in candidates:
                gs, gq, gc, gm = _condition_atoms(group)
                if states and not gs & states or not amounts <= gq or not critical <= gc or missing and not gm:
                    raise ValueError("Conjoined conditions were split")

    sort_cues = {
        "name": r"\b(?:alphabetically|alphabetical|a z|by name)\b",
        "quantity_asc": r"\b(?:lowest (?:quantity|stock) first|ascending quantity|quantity ascending)\b",
        "quantity_desc": r"\b(?:highest (?:quantity|stock)?\s*first|descending quantity|quantity descending)\b",
        "shortfall": r"\b(?:largest shortfall|shortfall)\b",
        "priority": PRIORITY,
    }
    requested_sorts = {sort for sort, cue in sort_cues.items() if re.search(cue, opaque)}
    if requested_sorts and requested_sorts != {plan.selection.sort} or plan.selection.sort != "none" and plan.selection.sort not in requested_sorts:
        raise ValueError("Sort not grounded")
