"""Conservative lexical checks for v3 plans, before deterministic phone execution.

This is a validation boundary, not another natural-language interpreter. Detectable
conditions must be retained and associated with their own clause; uncertain wording
fails closed. It neither knows inventory nor permits a server mutation.
"""

import re

from app.schemas.ai import Intent, Plan, Specification

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
SORT_CUES = {
    "name": r"\b(?:alphabetically|alphabetical|a z|by name)\b",
    "quantity_asc": r"\b(?:lowest (?:quantity|stock) first|ascending quantity|quantity ascending|(?:sort|sorted|order|ordered) by (?:stock|quantity)(?! (?:descending|highest|high)))\b",
    "quantity_desc": r"\b(?:highest (?:quantity|stock)?\s*first|descending quantity|quantity descending|(?:sort|sorted|order|ordered) by (?:stock|quantity) (?:descending|highest first|high to low))\b",
    "shortfall": r"\b(?:largest shortfall|shortfall)\b",
    "priority": PRIORITY,
}
MISSING_SUPPLIER = r"\b(?:(?:no|missing|without)(?: a| any)?(?: recorded)? suppliers?|suppliers?(?: is| are| has)? (?:not recorded|not set|missing|unrecorded))\b"


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
        (r"\b(?:in stock|(?:well )?stocked)\b", {"in_stock"}),
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
    names = _plan_names(plan)
    require_representable_numbers(question, names)
    text = words(numeric_text(question))
    opaque = " ".join(re.findall(r"\w+|[;,!?]", numeric_text(question)))
    for name in names:
        opaque = re.sub(rf"\b{re.escape(words(numeric_text(name)))}\b", "recorded_name", opaque)
    if re.search(r"\b(?:last (?:week|month|year)|next (?:week|month|year)|used (?:last|today|yesterday)|usage|forecast|expiry|expiration|expires|cheapest|prices?)\b", opaque):
        raise ValueError("Unsupported condition")
    if re.search(r"\b(?:not|no) (?:low(?: (?:in|on))? stock|out of stock|in stock|(?:well )?stocked|below|under)\b", opaque):
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

    requested_sorts = {sort for sort, cue in SORT_CUES.items() if re.search(cue, opaque)}
    if requested_sorts and requested_sorts != {plan.selection.sort} or plan.selection.sort != "none" and plan.selection.sort not in requested_sorts:
        raise ValueError("Sort not grounded")


# --- Completeness (V-21): nothing the person asked for may be dropped or changed. ---------------------
# The server cannot know recorded names, so every content word and number must be explained by the
# plan: by a copied name, a recognised cue, or ordinary connecting words. Unexplained wording fails
# closed and the phone asks the person to rephrase.
FILLER_WORDS = frozenset("""
a an the all any some every each everything anything of in on for to with from by at as about into within among
is are was were be been being am do does did have has had having there here this that these those it its they them
their we our us i me my you your please kindly could would can will shall should may might must let s t re ve ll d m
just also plus then now today currently current right so and or but if whether which what who how many much number count
total list show showing display displaying give get fetch find tell see view check pull up bring look know want need
needs like hey hi hello ok okay thanks thank quick quickly item items thing things product products inventory stuff
level levels status kind kinds type types ones both either too along well whose whichever supplies materials articles
details presently
""".split())
CUE_WORDS = frozenset("""
low out stock stocks below minimum running run short critical equipment non not marked flagged star starred quantity
quantities qty less fewer lower than more greater higher most least exactly equal equals precisely only between under
over above maximum remaining left hand stocked supplier suppliers supplied vendor vendors category categories brand
brands no missing recorded unrecorded sorted sort sorting order ordered orders alphabetically alphabetical name names
lowest highest first ascending descending largest biggest shortfall priority urgent urgently immediately consider
considering ordering prepare create make build draft drafts purchase purchases put together add adding set change
update replace increase reduce decrease remove delete take units unit pairs pair boxes box bottles bottle pieces piece packs
pack packets packet rolls roll tubes tube excluding exclude except other apart including include leaving leave omit
omitting skip skipping minus without results result shown previous earlier another extra saved unsaved new existing
""".split())
FIELD_CUES = {
    "supplier": r"\b(?:supplier|suppliers|supplied|vendor|vendors)\b",
    "category": r"\b(?:category|categories)\b",
    "brand": r"\b(?:brand|brands)\b",
}
# These phrases describe presentation or courtesy, rather than a new filter. Keep
# content words outside these bounded forms unexplained, so unknown names still fail.
BENIGN_PHRASES = (
    (r"\bwould you mind\b", "would you"),
    (r"\b(?:once|sir|madam|na|itself)$", ""),
    (r"\bin (?:our|my) store\b", "in inventory"),
    (r"\bkeep only\b", "only"),
    (r"\bfilter to\b", "only"),
    (r"\blast list\b", "previous list"),
    (r"\bthe following items\b", "items"),
    (r"\bsecond is\b", "is"),
    (r"\b(\d+(?: (?:units?|pairs?|boxes?|pieces?|packs?))?) available\b", r"\1"),
)
# "Supplier names for gloves" asks for displayed facts; "from supplier X"
# specifies a filter. Remove only the former field wording, never its subject.
DISPLAY_FIELDS = r"\b(?:suppliers?|vendors?|brands?)(?: names?)? (?:for|of)\b"
ADD_CUE = r"\b(?:add|adding|more|extra|another|increase)\b"
SET_CUE = r"\b(?:set|change|make|replace|update)\b"
REMOVE_CUE = r"\b(?:remove|delete|take out|drop|leave out|leaving out)\b"
REFERENCE_CUE = r"\b(?:those|these|them|they|that list|this list|the list|last list|the results|results|shown|previous|earlier|among|ones)\b"
FOLLOW_UP_START = r"^(?:only|just|exclude|excluding|except|without|sort|sorted|filter|now|then|and|also)\b"


def _plan_names(plan: Plan) -> list[str]:
    names = []
    if plan.selection:
        for group in [*plan.selection.any_of, *plan.selection.exclude]:
            names += [name for name in [*group.item_queries, group.category, group.supplier, group.brand] if name]
    if plan.draft:
        names += [value for line in plan.draft.lines for value in (line.item_query, line.unit) if value]
    return names


def _occurs(name: str, tokens: list[str]) -> list[int]:
    parts = words(numeric_text(name)).split()
    return [i for i in range(len(tokens) - len(parts) + 1) if parts and tokens[i:i + len(parts)] == parts]


def require_draft_operations(lines, question: str, names=()) -> None:
    """Keep each explicit operation with its own item, with copied names opaque."""
    operation_text = " ".join(re.findall(r"\w+|[;,!?]", numeric_text(question)))
    copied = {*names, *(value for line in lines for value in (line.item_query, line.unit) if value)}
    anchors = {}
    # Mask before splitting, too: a copied name may itself contain "and".
    for index, name in enumerate(sorted(copied, key=len, reverse=True)):
        anchors[name] = f"recorded_name_{index}"
        operation_text = re.sub(rf"\b{re.escape(words(numeric_text(name)))}\b", anchors[name], operation_text)
    cues, last = [], ""
    for part in clauses(operation_text):
        found = "remove" if re.search(REMOVE_CUE, part) else "add" if re.search(ADD_CUE, part) else "set" if re.search(SET_CUE, part) else ""
        last = found or last
        cues.append((part, found, last))
    for line in lines:
        if getattr(line, "target", "named") != "named" or not line.item_query:
            continue
        clause = next(((part, found, inherited) for part, found, inherited in cues if anchors[line.item_query] in part.split()), None)
        if clause is None:
            continue
        part, found, inherited = clause
        cue = found or inherited
        if line.operation == "set" and re.search(ADD_CUE, part):
            raise ValueError("Adding more was planned as replacing the quantity")
        if line.operation == "add" and cue != "add":
            raise ValueError("Add was not requested for this item")
        if line.operation == "remove" and cue != "remove":
            raise ValueError("Removal was not requested for this item")
        if line.operation in ("set", "add") and found == "remove":
            raise ValueError("A removal was planned as an order quantity")


def require_complete_plan(plan: Plan, question: str, has_previous: bool) -> None:
    """Every content word, number, field filter and draft operation the person said must be in the plan."""
    if plan.intent not in {"inventory_query", "draft_order"}:
        return
    tokens = words(numeric_text(question)).split()
    covered = [False] * len(tokens)
    for name in sorted(set(_plan_names(plan)), key=lambda value: len(words(numeric_text(value))), reverse=True):
        length = len(words(numeric_text(name)).split())
        for start in _occurs(name, tokens):
            covered[start:start + length] = [True] * length
    used = {str(c.value) for group in ([*plan.selection.any_of, *plan.selection.exclude] if plan.selection else []) for c in group.quantity}
    used |= {str(line.quantity) for line in (plan.draft.lines if plan.draft else []) if line.quantity is not None}
    coverage = " ".join("recorded_name" if copied else token for token, copied in zip(tokens, covered, strict=True))
    for pattern, replacement in BENIGN_PHRASES:
        coverage = re.sub(pattern, replacement, coverage)
    coverage_tokens = coverage.split()
    for index, token in enumerate(coverage_tokens):
        if token == "recorded_name":
            continue
        if token.isdigit():
            # "zero stock" names a stock state, not a quantity.
            if token in used or token == "0" and coverage_tokens[index + 1:index + 2] == ["stock"]:
                continue
            raise ValueError("A number in the request is not in the plan")
        if token not in FILLER_WORDS and token not in CUE_WORDS:
            raise ValueError("Part of the request is not in the plan")

    opaque = " ".join(tokens)
    for name in sorted(set(_plan_names(plan)), key=len, reverse=True):
        opaque = re.sub(rf"\b{re.escape(words(numeric_text(name)))}\b", "recorded_name", opaque)
    groups = [*plan.selection.any_of, *plan.selection.exclude] if plan.selection else []
    filters = re.sub(DISPLAY_FIELDS, " ", opaque)
    for field, cue in FIELD_CUES.items():
        if not re.search(cue, filters):
            continue
        if field == "supplier" and (re.search(MISSING_SUPPLIER, opaque) or any(group.missing_supplier for group in groups)):
            continue
        if not any(getattr(group, field) for group in groups):
            raise ValueError(f"The requested {field} filter is not in the plan")

    if plan.selection and re.search(rf"\b{EXCLUSION}\b", opaque):
        # A name the person wants included must come before the exclusion wording.
        included_tokens = scoped_text(" ".join(tokens))[0].split()
        for group in plan.selection.any_of:
            for name in [*group.item_queries, group.category, group.supplier, group.brand]:
                if name and not _occurs(name, included_tokens):
                    raise ValueError("An excluded name was selected")

    text = " ".join(tokens)
    if plan.selection and plan.selection.scope == "previous" and not (re.search(REFERENCE_CUE, text) or re.match(FOLLOW_UP_START, text)):
        raise ValueError("A follow-up to the previous list was not requested")

    if plan.draft:
        require_draft_operations(plan.draft.lines, question, _plan_names(plan))


# --- Older phones (V-22): contracts 1 and 2 keep their shapes but may not add or drop conditions. -----
STATUS_STATES = {"any": set(), "low": {"low"}, "out": {"out"}, "attention": {"low", "out"}, "below_minimum": {"below_minimum"}}
V1_LOW = r"\b(?:low|running low|running out|run out|short|restock|restocking|reorder|re order|need ordering|need to order|order soon)\b"
OUT_ALIASES = r"\b(?:run out|ran out|none left|nothing left|no stock|sold out|(?:are|is|anything) (?:empty|finished|depleted)|(?:empty|finished|depleted) (?:items?|products?|supplies|stock))\b"
V1_OUT = rf"(?:\b(?:out of stock|zero stock|0 stock|none left|no stock|sold out|run out|ran out|running out|empty)\b|{OUT_ALIASES})"
ATTENTION_ALIASES = r"\b(?:restock(?:ing)?|reorder(?:ing)?|re order(?:ing)?|need(?:s)?(?: to)? order(?:ing)?|order soon)\b"


def require_v2_conditions(spec: Specification, question: str) -> None:
    """Contract 2: stock states, missing supplier and representable sorting must match the request both ways."""
    if spec.intent not in {"inventory_query", "draft_order"}:
        return
    names = [line.item_query for line in spec.lines]
    if spec.query:
        names += [name for name in [*spec.query.item_queries, spec.query.category, spec.query.supplier, spec.query.brand] if name]
    opaque = words(numeric_text(question))
    for name in sorted(set(names), key=len, reverse=True):
        opaque = re.sub(rf"\b{re.escape(words(numeric_text(name)))}\b", "recorded_name", opaque)
    expected = stock_states(opaque)
    if re.search(OUT_ALIASES, opaque):
        expected.add("out")
    if re.search(r"\brunning short\b", opaque):
        expected.add("low")
    if not expected and re.search(ATTENTION_ALIASES, opaque):
        expected = {"low", "out"}
    if "in_stock" in expected:
        raise ValueError("In-stock filtering needs a newer contract")
    if spec.intent == "inventory_query":
        actual = STATUS_STATES[spec.query.status]
        if spec.query.missing_supplier != bool(re.search(MISSING_SUPPLIER, opaque)):
            raise ValueError("Missing-supplier filter does not match the request")
        requested_sorts = {sort for sort, cue in SORT_CUES.items() if re.search(cue, opaque)}
        actual_sort = {"stock": "quantity_asc"}.get(spec.query.sort, spec.query.sort)
        if requested_sorts != (set() if actual_sort == "none" else {actual_sort}):
            raise ValueError("Sorting does not match the request")
    else:
        actual = ({"low"} if spec.include_low else set()) | ({"out"} if spec.include_out else set())
        require_draft_operations(spec.lines, question, names)
    if actual != expected:
        raise ValueError("Stock condition does not match the request")


def require_v1_conditions(intent: Intent, question: str) -> None:
    """Contract 1: a low-stock or out-of-stock answer needs that wording."""
    text = words(numeric_text(question))
    if intent.intent == "low_stock" and not re.search(V1_LOW, text):
        raise ValueError("Low stock was not requested")
    if intent.intent == "out_of_stock" and not re.search(V1_OUT, text):
        raise ValueError("Out of stock was not requested")
