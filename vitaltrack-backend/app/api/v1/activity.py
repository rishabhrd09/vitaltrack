"""
VitalTrack Backend - Activity Log Routes
Read-only access to user activity history.
"""

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.api.deps import DB, CurrentUser
from app.models import ActivityLog
from app.schemas.activity import ActivityLogList, ActivityLogResponse


router = APIRouter(prefix="/activities", tags=["Activities"])


@router.get(
    "",
    response_model=ActivityLogList,
    summary="List user activity logs",
)
async def list_activities(
    db: DB,
    current_user: CurrentUser,
    limit: int = Query(50, ge=1, le=200),
) -> ActivityLogList:
    """
    Get the most recent activity log entries for the current user.

    Ordered by most recent first.
    """
    result = await db.execute(
        select(ActivityLog)
        .where(ActivityLog.user_id == current_user.id)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
    )
    activities = result.scalars().all()

    return ActivityLogList(
        activities=[
            ActivityLogResponse.model_validate(
                {
                    "id": a.id,
                    "action": a.action.value if hasattr(a.action, "value") else str(a.action),
                    "item_name": a.item_name,
                    "item_id": a.item_id,
                    "details": a.details,
                    "order_id": a.order_id,
                    "created_at": a.created_at,
                }
            )
            for a in activities
        ],
        total=len(activities),
    )
