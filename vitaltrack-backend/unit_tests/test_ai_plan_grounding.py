"""Hostile schema-valid model plans must not change the user's explicit meaning."""

import json

import pytest
from fastapi import HTTPException

from app.schemas.ai import Plan
from app.services import ai_provider
from app.services.ai_provider import ground_plan


def group(**patch):
    return {"item_queries": [], "stock": [], "quantity": [], "critical": None,
            "category": None, "supplier": None, "brand": None, "missing_supplier": False, **patch}


def amount(value, op="lt"):
    return {"op": op, "value": value}


def query(*groups, exclude=(), sort="none"):
    return Plan.model_validate({"version": 3, "intent": "inventory_query", "selection": {
        "scope": "inventory", "any_of": list(groups), "exclude": list(exclude), "sort": sort},
        "draft": None, "clarify_reason": None})


def draft(quantity, name="Ambu Bag", unit="units"):
    return Plan.model_validate({"version": 3, "intent": "draft_order", "selection": None,
        "draft": {"mode": "new", "include_selection": False, "lines": [
            {"operation": "set", "target": "named", "item_query": name, "quantity": quantity, "unit": unit}]},
        "clarify_reason": None})


@pytest.mark.parametrize("question,plan", [
    ("Show items below -3", query(group(quantity=[amount(3)]))),
    ("Show items below -zero", query(group(quantity=[amount(0)]))),
    ("Show items below −zero", query(group(quantity=[amount(0)]))),
    ("Show items below-zero", query(group(quantity=[amount(0)]))),
    ("Show items less than zero", query(group(quantity=[amount(1)]))),
    ("Show low-stock items less than zero", query(group(stock=["low"], quantity=[amount(1)]))),
    ("Show items below −3", query(group(quantity=[amount(3)]))),
    ("Show items below negative three", query(group(quantity=[amount(3)]))),
    ("Show items below 3.5", query(group(quantity=[amount(3)]))),
    ("Show items below 3/4", query(group(quantity=[amount(3)]))),
    ("Show items below 3e2", query(group(quantity=[amount(3)]))),
    ("Show items below three hundred", query(group(quantity=[amount(3)]))),
    ("Show items below 1,000", query(group(quantity=[amount(1)]))),
    ("Prepare -2 units of Ambu Bag in an order draft", draft(2)),
    ("Show gloves", query(group(item_queries=["gloves"], stock=["out"]))),
    ("Show low stock items", query(group(stock=["in_stock"]))),
    ("Show items that are not low stock", query(group(stock=["low"]))),
    ("Show critical items", query(group(critical=False))),
    ("Show non-critical items", query(group(critical=True))),
    ("Show items from supplier Good Supplier", query(group(supplier="Good Supplier", missing_supplier=True))),
    ("Show all items", query(group(), exclude=[group(critical=True)])),
    ("Show all critical items", query(group(), exclude=[group(critical=True)])),
    ("Show all items excluding gloves but include masks", query(group(), exclude=[group(item_queries=["gloves", "masks"])])),
    ("Show gloves below 3 and masks below 5", query(group(item_queries=["gloves"], quantity=[amount(5)]), group(item_queries=["masks"], quantity=[amount(3)]))),
    ("Show gloves below 3, masks below 5", query(group(item_queries=["gloves"], quantity=[amount(5)]), group(item_queries=["masks"], quantity=[amount(3)]))),
    ("Show low-stock gloves and out-of-stock masks", query(group(item_queries=["gloves"], stock=["out"]), group(item_queries=["masks"], stock=["low"]))),
    ("Show low-stock items less than 3", query(group(stock=["low"]))),
    ("Show low-stock items less than 3", query(group(quantity=[amount(3)]))),
    ("Show low-stock items less than 3", query(group(stock=["low"]), group(quantity=[amount(3)]))),
    ("Show critical items that are low stock", query(group(critical=True), group(stock=["low"]))),
    ("Show critical items and low-stock items", query(group(critical=True, stock=["low"]))),
    ("Show low-stock items or critical equipment", query(group(stock=["low"]))),
    ("Show low-stock items or critical equipment", query(group(stock=["low"], critical=True))),
    ("Show items with quantity 3 or more or critical equipment", query(group(critical=True))),
    ("Show items below 3 and also all low stock items", query(group(quantity=[amount(3)], stock=["low"]))),
    ("Show low stock items", query(group(stock=["low"]), group())),
    ("Show low and out of stock items", query(group(stock=["low"]))),
    ("Show items below 3 sorted alphabetically", query(group(quantity=[amount(3)]))),
    ("Show gloves", query(group(item_queries=["gloves"]), sort="priority")),
    ("Show items used last week", query(group())),
    ("Hello Ambu Bag", draft(None)),
    ("Prepare an order draft for 2 units of Ambu Bag and all low-stock items", draft(2)),
])
def test_wrong_plans_fail_closed(question, plan):
    with pytest.raises(ValueError):
        ground_plan(plan, question, False)


@pytest.mark.parametrize("question,plan", [
    ("Show gloves below 3 and masks below 5", query(group(item_queries=["gloves"], quantity=[amount(3)]), group(item_queries=["masks"], quantity=[amount(5)]))),
    ("Show items with quantity exactly zero", query(group(quantity=[amount(0, "eq")]))),
    ("Show items with quantity less than zero", query(group(quantity=[amount(0)]))),
    ("Show low-stock items with quantity less than zero", query(group(stock=["low"], quantity=[amount(0)]))),
    ("Show items with zero stock", query(group(stock=["out"]))),
    ("Show items from supplier Zero Stock Limited", query(group(supplier="Zero Stock Limited"))),
    ("Show Zero Filter", query(group(item_queries=["Zero Filter"]))),
    ("Show items with quantity exactly nineteen", query(group(quantity=[amount(19, "eq")]))),
    ("Show gloves below 3, masks below 5", query(group(item_queries=["gloves"], quantity=[amount(3)]), group(item_queries=["masks"], quantity=[amount(5)]))),
    ("Show low-stock gloves and out-of-stock masks", query(group(item_queries=["gloves"], stock=["low"]), group(item_queries=["masks"], stock=["out"]))),
    ("Show low-stock items less than 3", query(group(stock=["low"], quantity=[amount(3)]))),
    ("Show critical items that are low or out of stock", query(group(critical=True, stock=["low", "out"]))),
    ("Show low-stock items and critical items", query(group(stock=["low"]), group(critical=True))),
    ("Show low-stock items or critical equipment", query(group(stock=["low"]), group(critical=True))),
    ("Show critical items that are low-stock or out of stock", query(group(critical=True, stock=["low", "out"]))),
    ("Show items with quantity 3 or more", query(group(quantity=[amount(3, "gte")]))),
    ("Show items with quantity 3 or fewer", query(group(quantity=[amount(3, "lte")]))),
    ("Show items with quantity 3 or more or critical equipment", query(group(quantity=[amount(3, "gte")]), group(critical=True))),
    ("Show low-stock items; critical items", query(group(stock=["low"]), group(critical=True))),
    ("Show items below 3 and also all low or out of stock items", query(group(quantity=[amount(3)]), group(stock=["low", "out"]))),
    ("Show items between two and five", query(group(quantity=[amount(2, "gte"), amount(5, "lte")]))),
    ("Show items with no supplier recorded", query(group(missing_supplier=True))),
    ("Show non-critical items", query(group(critical=False))),
    ("Show items below 3 excluding critical equipment", query(group(quantity=[amount(3)]), exclude=[group(critical=True)])),
    ("Show critical items excluding gloves", query(group(critical=True), exclude=[group(item_queries=["gloves"])])),
    ("Which stocks should I consider ordering now?", query(group(stock=["low", "out"]), sort="priority")),
    ("Show Saline 0.9%", query(group(item_queries=["Saline 0.9%"]))),
    ("Show Filter-3", query(group(item_queries=["Filter-3"]))),
    ("Show items in category Critical Care", query(group(category="Critical Care"))),
    ("Show items from supplier Low Stock Limited", query(group(supplier="Low Stock Limited"))),
    ("Show items from supplier Above 3", query(group(supplier="Above 3"))),
    ("Show items from supplier Above Three", query(group(supplier="Above Three"))),
    ("Show items in category Critical Three", query(group(category="Critical Three"))),
    ("Show low-stock items from supplier Above Three below 5", query(group(supplier="Above Three", stock=["low"], quantity=[amount(5)]))),
    ("Show items in category Sort By Name", query(group(category="Sort By Name"))),
    ("Show items from supplier Last Week Supplies", query(group(supplier="Last Week Supplies"))),
    ("Prepare an order draft for 2 units of Ambu Bag", draft(2)),
    ("Prepare an order draft for 2 units of Zero Bag", draft(2, "Zero Bag")),
])
def test_supported_filters_and_recorded_numeric_names_are_retained(question, plan):
    ground_plan(plan, question, False)


# V-21: plans that drop or change what was asked are rejected; their faithful versions are accepted.
def plan(intent="inventory_query", groups=(), exclude=(), scope="inventory", lines=(), mode="new", include_selection=False, sort="none"):
    selection = {"scope": scope, "any_of": list(groups), "exclude": list(exclude), "sort": sort} if groups else None
    draft_part = {"mode": mode, "include_selection": include_selection, "lines": list(lines)} if intent == "draft_order" else None
    return Plan.model_validate({"version": 3, "intent": intent, "selection": selection, "draft": draft_part, "clarify_reason": None})


def line(name, quantity=None, operation="set", unit=None):
    return {"operation": operation, "target": "named", "item_query": name, "quantity": quantity, "unit": unit}


DROPPED_OR_CHANGED = [
    ("Prepare an order for all low stock items except gloves",
     plan("draft_order", [group(stock=["low"])], include_selection=True), False),
    ("Show low stock items from supplier Medline", plan(groups=[group(stock=["low"])]), False),
    ("Show gloves and masks", plan(groups=[group(item_queries=["gloves"])]), False),
    ("Add 5 more gloves to the draft", plan("draft_order", lines=[line("gloves", 5, "set")], mode="edit"), False),
    ("Which items are out of stock?", plan(groups=[group(stock=["out"])], scope="previous"), True),
    ("Add masks and remove gloves from my draft",
     plan("draft_order", lines=[line("masks", None, "remove"), line("gloves", None, "add")], mode="edit"), False),
    ("Prepare an order with 2 units of Ambu Bag and 3 boxes of masks",
     plan("draft_order", lines=[line("Ambu Bag", 2, unit="units")]), False),
    ("Show all items except gloves", plan(groups=[group(item_queries=["gloves"])]), False),
    ("Show low stock items in category Wound Care", plan(groups=[group(stock=["low"])]), False),
    ("Show low stock Medline items", plan(groups=[group(stock=["low"])]), False),
]
FAITHFUL = [
    ("Prepare an order for all low stock items except gloves",
     plan("draft_order", [group(stock=["low"])], exclude=[group(item_queries=["gloves"])], include_selection=True), False),
    ("Show low stock items from supplier Medline", plan(groups=[group(stock=["low"], supplier="Medline")]), False),
    ("Show gloves and masks", plan(groups=[group(item_queries=["gloves"]), group(item_queries=["masks"])]), False),
    ("Add 5 more gloves to the draft", plan("draft_order", lines=[line("gloves", 5, "add")], mode="edit"), False),
    ("Which items are out of stock?", plan(groups=[group(stock=["out"])]), True),
    ("Only the out of stock ones", plan(groups=[group(stock=["out"])], scope="previous"), True),
    ("Exclude masks", plan(groups=[group()], exclude=[group(item_queries=["masks"])], scope="previous"), True),
    ("Add masks and remove gloves from my draft",
     plan("draft_order", lines=[line("masks", None, "add"), line("gloves", None, "remove")], mode="edit"), False),
    ("Prepare an order with 2 units of Ambu Bag and 3 boxes of masks",
     plan("draft_order", lines=[line("Ambu Bag", 2, unit="units"), line("masks", 3, unit="boxes")]), False),
    ("Hey, could you please show me the low stock items?", plan(groups=[group(stock=["low"])]), False),
    ("Set the order quantity for masks to 10 boxes", plan("draft_order", lines=[line("masks", 10, unit="boxes")], mode="edit"), False),
]


@pytest.mark.parametrize("question,wrong,previous", DROPPED_OR_CHANGED)
def test_dropped_or_changed_requests_fail_closed(question, wrong, previous):
    with pytest.raises(ValueError):
        ground_plan(wrong, question, previous)


@pytest.mark.parametrize("question,faithful,previous", FAITHFUL)
def test_faithful_plans_are_accepted(question, faithful, previous):
    ground_plan(faithful, question, previous)


# V-22: contracts 1 and 2 (older phones) cannot add or drop stock conditions.
from app.schemas.ai import Intent, Specification  # noqa: E402
from app.services.ai_plan_grounding import require_v1_conditions, require_v2_conditions  # noqa: E402


def spec(intent="inventory_query", status="any", lines=(), include_low=False, include_out=False, missing=False, sort="none", items=(), supplier=None, mode="new"):
    query = {"status": status, "category": None, "supplier": supplier, "brand": None, "missing_supplier": missing,
             "item_queries": list(items), "sort": sort, "previous": False} if intent == "inventory_query" else None
    return Specification.model_validate({"version": 2, "intent": intent, "draft_mode": mode if intent == "draft_order" else None,
        "query": query, "lines": list(lines), "include_low": include_low, "include_out": include_out})


def v2_line(name, quantity, unit=None):
    return {"operation": "set", "item_query": name, "quantity": quantity, "unit": unit}


@pytest.mark.parametrize("question,wrong", [
    ("Prepare a draft for 20 pairs of gloves", spec("draft_order", lines=[v2_line("gloves", 20, "pairs")], include_low=True, include_out=True)),
    ("Show gloves", spec(status="out", items=["gloves"])),
    ("Show low stock items", spec(status="attention")),
    ("Show low stock items", spec(status="any")),
    ("Show items with no supplier recorded", spec()),
    ("Show items sorted alphabetically", spec()),
    ("Show items", spec(sort="name")),
])
def test_v2_added_or_dropped_conditions_fail_closed(question, wrong):
    with pytest.raises(ValueError):
        require_v2_conditions(wrong, question)


@pytest.mark.parametrize("question,faithful", [
    ("Prepare a draft for 20 pairs of gloves", spec("draft_order", lines=[v2_line("gloves", 20, "pairs")])),
    ("Prepare an order for the low-stock and out-of-stock items", spec("draft_order", include_low=True, include_out=True)),
    ("Show gloves", spec(items=["gloves"])),
    ("Show low stock items", spec(status="low")),
    ("Show items that are low or out of stock", spec(status="attention")),
    ("Show items with no supplier recorded", spec(missing=True)),
    ("Show items sorted alphabetically", spec(sort="name")),
    ("Show items from supplier Low Stock Limited", spec(supplier="Low Stock Limited")),
])
def test_v2_faithful_specifications_are_accepted(question, faithful):
    require_v2_conditions(faithful, question)


def intent(name):
    return Intent.model_validate({"intent": name, "item_query": None, "reference": "none", "fields": []})


def test_v1_list_intents_need_their_wording():
    with pytest.raises(ValueError):
        require_v1_conditions(intent("low_stock"), "Show gloves")
    with pytest.raises(ValueError):
        require_v1_conditions(intent("out_of_stock"), "Which items are low?")
    for question in ("Which items are low?", "What needs restocking?", "What are we running low on?"):
        require_v1_conditions(intent("low_stock"), question)
    for question in ("Which items are out of stock?", "What has run out?", "Which items have zero stock?"):
        require_v1_conditions(intent("out_of_stock"), question)
    require_v1_conditions(intent("summary"), "Give me an overview")


# Independent-review regressions: a faithful plan must survive ordinary wording,
# while unknown content and actual field/stock conditions must still be retained.
@pytest.mark.parametrize("question", [
    "Would you mind showing me the low stock items?",
    "Please show whichever items are low in stock",
    "Kindly list low-stock supplies",
    "Could you show the low-stock materials?",
    "Show me low stock articles",
    "Please show low stock items once",
    "Please show low stock items sir",
    "Please show low stock items madam",
    "Low stock items only please na",
    "Kindly show low stock items itself",
    "I need details of the low stock items",
    "Can I see what is low in stock presently?",
    "Could you show me the low stock items in our store?",
])
def test_review_courtesy_and_generic_item_words_keep_the_same_filter(question):
    ground_plan(query(group(stock=["low"])), question, False)


@pytest.mark.parametrize("question", [
    "Could you please list items whose quantity is below three?",
    "Show items having fewer than three units available",
])
def test_review_benign_quantity_grammar_is_accepted(question):
    ground_plan(query(group(quantity=[amount(3)])), question, False)


@pytest.mark.parametrize("question", [
    "Please keep only the critical ones",
    "Could you show only the critical items from the last list?",
    "Filter to critical items",
])
def test_review_follow_up_grammar_still_requires_previous_context(question):
    faithful = plan(groups=[group(critical=True)], scope="previous")
    ground_plan(faithful, question, True)
    with pytest.raises(ValueError):
        ground_plan(faithful, question, False)


def test_review_dictated_list_markers_do_not_drop_lines_or_stock_groups():
    question = ("Create a saved order draft for the following items: first is two units of Ambu bag, "
                "and second is all the items which are low in stock or out of stock, create a saved order draft.")
    ground_plan(plan("draft_order", [group(stock=["low", "out"])],
                     lines=[line("Ambu bag", 2, unit="units")], include_selection=True), question, False)
    with pytest.raises(ValueError):
        ground_plan(plan("draft_order", lines=[line("Ambu bag", 2, unit="units")]), question, False)


@pytest.mark.parametrize("question", [
    "Kindly list low stock supplies from supplier Medline",
    "Please show low stock items in Ward Three",
    "Please show whichever low stock items have expiry tomorrow",
    "Show low stock items and available items",
])
def test_review_benign_grammar_does_not_swallow_other_content(question):
    with pytest.raises(ValueError):
        ground_plan(query(group(stock=["low"])), question, False)


@pytest.mark.parametrize("question,faithful", [
    ("Kindly show the supplier for gloves", query(group(item_queries=["gloves"]))),
    ("Could you show the supplier of gloves please", query(group(item_queries=["gloves"]))),
    ("Show supplier names for all low stock items", query(group(stock=["low"]))),
    ("Show brand names for low stock items", query(group(stock=["low"]))),
    ("Show supplier names for gloves from supplier Medline", query(group(item_queries=["gloves"], supplier="Medline"))),
    ("Show brand names for gloves from brand Acme", query(group(item_queries=["gloves"], brand="Acme"))),
])
def test_review_displayed_fields_do_not_add_filters(question, faithful):
    ground_plan(faithful, question, False)


@pytest.mark.parametrize("question,wrong", [
    ("Show supplier names for gloves from supplier Medline", query(group(item_queries=["gloves"]))),
    ("Show supplier names for gloves from supplier gloves", query(group(item_queries=["gloves"]))),
    ("Show brand names for gloves from brand Acme", query(group(item_queries=["gloves", "Acme"]))),
    ("Show low stock items from supplier Low", query(group(stock=["low"]))),
    ("Show items from supplier Medline", query(group(brand="Medline"))),
])
def test_review_projection_does_not_hide_a_real_field_filter(question, wrong):
    with pytest.raises(ValueError):
        ground_plan(wrong, question, False)


@pytest.mark.parametrize("name", ["More Gauze", "Extra Gloves", "Add On Mask", "Remove Adhesive", "Band and More Gauze"])
def test_review_copied_item_words_do_not_change_the_requested_operation(name):
    question = f"Kindly set the draft quantity for {name} to 5"
    ground_plan(plan("draft_order", lines=[line(name, 5)], mode="edit"), question, False)
    with pytest.raises(ValueError):
        ground_plan(plan("draft_order", lines=[line(name, 5, "add")], mode="edit"), question, False)


def test_review_copied_unit_is_not_an_operation_cue():
    ground_plan(plan("draft_order", lines=[line("gloves", 5, unit="extra")], mode="edit"),
                "Set the draft quantity for gloves to 5 extra", False)


@pytest.mark.parametrize("question,wrong", [
    ("Add 5 More Gauze to the draft", plan("draft_order", lines=[line("More Gauze", 5)], mode="edit")),
    ("Remove Extra Gloves from my draft", plan("draft_order", lines=[line("Extra Gloves", operation="add")], mode="edit")),
    ("Add 5 Band and More Gauze to the draft", plan("draft_order", lines=[line("Band and More Gauze", 5)], mode="edit")),
])
def test_review_masked_names_do_not_hide_the_actual_operation(question, wrong):
    with pytest.raises(ValueError):
        ground_plan(wrong, question, False)


@pytest.mark.parametrize("question,state", [
    ("What needs restocking?", "attention"),
    ("Show items to reorder", "attention"),
    ("Show items that need ordering", "attention"),
    ("Show items we should restock", "attention"),
    ("Show anything running short", "low"),
    ("Which items have run out?", "out"),
    ("Anything finished?", "out"),
    ("Which items are depleted?", "out"),
    ("Which items are empty?", "out"),
    ("Which items have no stock?", "out"),
    ("Show items with nothing left", "out"),
    ("Show items with none left", "out"),
    ("Show sold out items", "out"),
])
def test_review_v2_stock_aliases_must_be_kept(question, state):
    require_v2_conditions(spec(status=state), question)
    with pytest.raises(ValueError):
        require_v2_conditions(spec(), question)


@pytest.mark.parametrize("question", ["Anything finished?", "Which items are depleted?", "Show items with nothing left"])
def test_review_v1_out_of_stock_aliases(question):
    require_v1_conditions(intent("out_of_stock"), question)
    with pytest.raises(ValueError):
        require_v1_conditions(intent("low_stock"), question)


def test_review_v1_running_out_keeps_its_existing_legacy_representations():
    # Contract 1 already allowed both readings of this ambiguous phrase. New
    # aliases must not silently change which legacy response is accepted.
    for name in ("low_stock", "out_of_stock"):
        require_v1_conditions(intent(name), "What are we running out of?")


def test_review_v2_aliases_do_not_read_conditions_from_copied_names():
    require_v2_conditions(spec(supplier="Sold Out Limited"), "Show items from supplier Sold Out Limited")
    require_v2_conditions(spec(items=["Empty Gloves"]), "Show Empty Gloves")


@pytest.mark.parametrize("question,sort", [
    ("Show items sorted by stock", "quantity_asc"),
    ("Show items sorted by quantity", "quantity_asc"),
    ("Show items sorted by stock descending", "quantity_desc"),
])
def test_review_quantity_sort_aliases_match_the_requested_direction(question, sort):
    ground_plan(query(group(), sort=sort), question, False)
    if sort == "quantity_asc":
        require_v2_conditions(spec(sort="stock"), question)
    else:
        for old_sort in ("none", "stock"):
            with pytest.raises(ValueError):
                require_v2_conditions(spec(sort=old_sort), question)


@pytest.mark.parametrize("question", [
    "Show items without any recorded supplier",
    "Show items without a recorded supplier",
    "Show items whose supplier is missing",
])
def test_review_missing_supplier_modifiers_are_retained(question):
    ground_plan(query(group(missing_supplier=True)), question, False)
    require_v2_conditions(spec(missing=True), question)
    with pytest.raises(ValueError):
        ground_plan(query(group()), question, False)
    with pytest.raises(ValueError):
        require_v2_conditions(spec(), question)


def test_review_stocked_is_an_in_stock_condition_not_a_discardable_word():
    question = "Show low stock items and stocked items"
    ground_plan(query(group(stock=["low"]), group(stock=["in_stock"])), question, False)
    with pytest.raises(ValueError):
        ground_plan(query(group(stock=["low"])), question, False)
    with pytest.raises(ValueError):
        ground_plan(query(group(stock=["in_stock"])), "Show items that are not stocked", False)
    ground_plan(query(group(supplier="Stocked Limited")), "Show items from supplier Stocked Limited", False)
    ground_plan(query(group(supplier="Not Stocked Limited")), "Show items from supplier Not Stocked Limited", False)


@pytest.mark.asyncio
@pytest.mark.parametrize("version", [2, 3])
@pytest.mark.parametrize("question,lines", [
    ("Please add five extra gloves to the draft", [line("gloves", 5, "add")]),
    ("Set gloves in my draft to five", [line("gloves", 5)]),
    ("Increase the draft quantity of gloves by five", [line("gloves", 5, "add")]),
    ("Please add 5 extra pairs of gloves and 3 boxes of masks to the draft",
     [line("gloves", 5, "add", "pairs"), line("masks", 3, "add", "boxes")]),
])
async def test_review_provider_keeps_bounded_quantity_phrasings(monkeypatch, version, question, lines):
    faithful = (plan("draft_order", lines=lines, mode="edit") if version == 3 else
                spec("draft_order", lines=[{key: value for key, value in row.items() if key != "target"} for row in lines], mode="edit"))

    async def response(*args, **kwargs):
        return json.dumps({"choices": [{"finish_reason": "stop", "message": {"content": faithful.model_dump_json()}}]}).encode()

    monkeypatch.setattr(ai_provider, "bounded_call", response)
    result, _ = await ai_provider.interpret(question, False, version)
    assert result == faithful


@pytest.mark.asyncio
@pytest.mark.parametrize("version", [2, 3])
@pytest.mark.parametrize("question,lines", [
    ("Please add 5 extra gloves and 20 masks to the draft", [line("gloves", 20, "add"), line("masks", 5, "add")]),
    ("Set gloves in my draft to 5 and masks to 20", [line("gloves", 20), line("masks", 5)]),
    ("Increase the draft quantity of gloves by 5; add masks 20", [line("gloves", 20, "add"), line("masks", 5, "add")]),
    ("Set gloves in my draft to 5; for masks make it 20", [line("gloves", 20), line("masks", 5)]),
    ("Please add 5 extra pairs of gloves to the draft", [line("gloves", 5, "add", "boxes")]),
    ("Increase the draft quantity of gloves by 5", [line("gloves", 5)]),
    ("Set gloves in my draft to 5", [line("gloves", 5, "add")]),
    ("Prepare a draft for 5 gloves", [line("gloves", 5, "add")]),
])
async def test_review_provider_does_not_borrow_another_item_or_clause_quantity(monkeypatch, version, question, lines):
    wrong = (plan("draft_order", lines=lines, mode="edit") if version == 3 else
             spec("draft_order", lines=[{key: value for key, value in row.items() if key != "target"} for row in lines], mode="edit"))

    async def response(*args, **kwargs):
        return json.dumps({"choices": [{"finish_reason": "stop", "message": {"content": wrong.model_dump_json()}}]}).encode()

    monkeypatch.setattr(ai_provider, "bounded_call", response)
    with pytest.raises(HTTPException) as refused:
        await ai_provider.interpret(question, False, version)
    assert refused.value.status_code == 502
