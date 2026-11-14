#!/usr/bin/env python3
"""Operator-only abandoned-review retention. Dry run by default, one batch only."""

import argparse
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--expect-environment", choices=["development", "testing", "staging", "production"])
    args = parser.parse_args()
    if not 30 <= args.days <= 3650 or not 1 <= args.limit <= 100:
        parser.error("Use 30..3650 days and a batch limit of 1..100")
    if args.apply and not args.expect_environment:
        parser.error("Applying retention requires --expect-environment")
    return args


async def run(args):
    from app.core.config import settings
    from app.core.database import AsyncSessionLocal, engine
    from app.services.supply_retention import prune_abandoned_reviews

    if args.expect_environment and args.expect_environment != settings.ENVIRONMENT:
        raise ValueError("Environment does not match the explicit operator selection")
    try:
        async with AsyncSessionLocal.begin() as db:
            count = await prune_abandoned_reviews(
                db, now=datetime.now(timezone.utc), days=args.days, limit=args.limit, apply=args.apply
            )
        print(f"{'Deleted' if args.apply else 'Dry-run eligible'} abandoned reviews: {count} (one bounded batch)")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(run(arguments()))
