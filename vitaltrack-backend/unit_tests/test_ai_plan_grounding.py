"""Hostile schema-valid model plans must not change the user's explicit meaning."""

import pytest

from app.schemas.ai import Plan
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
