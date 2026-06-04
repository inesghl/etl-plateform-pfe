"""

"""
from datetime import timedelta
from django.db.models import ExpressionWrapper, DurationField

from django.db.models import (
    Avg, Case, Count, F, FloatField, Q, Sum, When,
)
from django.db.models.functions import TruncDate
from django.utils import timezone as tz
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..accounts.permissions import IsAdmin
from ..etl.models import ETL
from ..execution.models import Execution
from ..output_file.models import OutputFile
from ..scheduling.models import ETLSchedule


# ─────────────────────────────────────────────────────────────
# Shared helper — builds the common stat payload from a queryset
# ─────────────────────────────────────────────────────────────

def _build_stats_payload(execs, range_param: str) -> dict:
    """Given a filtered Execution queryset, compute all stats."""
    total = execs.count()
    success_count = execs.filter(status="SUCCESS").count()
    success_rate = round((success_count / total * 100), 1) if total else 0

    avg_duration = (
        execs.filter(started_at__isnull=False, completed_at__isnull=False)
        .annotate(dur=ExpressionWrapper(F("completed_at") - F("started_at"), output_field=DurationField()))
        .aggregate(avg=Avg("dur"))["avg"]
    )
    avg_duration_s = round(avg_duration.total_seconds()) if avg_duration else 0

    output_files_count = OutputFile.objects.filter(execution__in=execs).count()
    output_files_size_mb = round(
        (OutputFile.objects.filter(execution__in=execs).aggregate(total=Sum("file_size"))["total"] or 0)
        / (1024 * 1024), 1,
    )

    status_dist = list(
        execs.values("status").annotate(count=Count("id")).order_by("-count")
    )

    timeline = [
        {"date": str(row["day"]), "success": row["success"], "failed": row["failed"], "total": row["total"]}
        for row in (
            execs.annotate(day=TruncDate("launched_at"))
            .values("day")
            .annotate(
                success=Count("id", filter=Q(status="SUCCESS")),
                failed=Count("id", filter=Q(status="FAILED")),
                total=Count("id"),
            )
            .order_by("day")
        )
    ]

    top_etls = list(
        execs.values("etl__id", "etl__name", "etl__version")
        .annotate(runs=Count("id"), successes=Count("id", filter=Q(status="SUCCESS")))
        .order_by("-runs")[:10]
    )
    for row in top_etls:
        row["success_rate"] = round(row["successes"] / row["runs"] * 100, 1) if row["runs"] else 0

    file_types = list(
        OutputFile.objects.filter(execution__in=execs)
        .values("file_type")
        .annotate(count=Count("id"), size_mb=Sum("file_size"))
        .order_by("-count")
    )
    for row in file_types:
        row["size_mb"] = round((row["size_mb"] or 0) / (1024 * 1024), 1)

    recent_failures = list(
        execs.filter(status="FAILED")
        .select_related("etl", "launched_by")
        .order_by("-launched_at")[:10]
        .values("id", "etl__name", "launched_by__email", "launched_at", "error_message", "stderr_log")
    )
    for row in recent_failures:
        row["launched_at"] = row["launched_at"].isoformat() if row["launched_at"] else None
        row["error_snippet"] = (row["error_message"] or row["stderr_log"] or "")[:120]

    return {
        "range": range_param,
        "kpis": {
            "total_executions": total,
            "success_rate": success_rate,
            "avg_duration_seconds": avg_duration_s,
            "output_files_count": output_files_count,
            "output_files_size_mb": output_files_size_mb,
        },
        "status_distribution": status_dist,
        "timeline": timeline,
        "top_etls": top_etls,
        "file_types": file_types,
        "recent_failures": recent_failures,
    }


def _date_filter(range_param: str):
    """Return a Q filter for launched_at based on the range param."""
    now = tz.now()
    if range_param == "7d":
        return Q(launched_at__gte=now - timedelta(days=7))
    if range_param == "30d":
        return Q(launched_at__gte=now - timedelta(days=30))
    return Q()  # "all" — no date filter


class DashboardStatsView(APIView):
    """Admin-only: platform-wide stats across all users."""
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        range_param = request.query_params.get("range", "30d")
        execs = Execution.objects.filter(_date_filter(range_param))

        payload = _build_stats_payload(execs, range_param)

        # Extra admin-only block: top users + ETL health
        top_users = list(
            execs.filter(launched_by__isnull=False)
            .values("launched_by__id", "launched_by__email",
                    "launched_by__first_name", "launched_by__last_name")
            .annotate(runs=Count("id"), successes=Count("id", filter=Q(status="SUCCESS")))
            .order_by("-runs")[:10]
        )
        for row in top_users:
            row["success_rate"] = round(row["successes"] / row["runs"] * 100, 1) if row["runs"] else 0

        etl_health = {
            "total":            ETL.objects.count(),
            "active":           ETL.objects.filter(is_active=True).count(),
            "validated":        ETL.objects.filter(is_validated=True).count(),
            "with_groups":      ETL.objects.filter(allowed_groups__isnull=False).distinct().count(),
            "active_schedules": ETLSchedule.objects.filter(is_active=True).count(),
        }

        payload["top_users"]  = top_users
        payload["etl_health"] = etl_health
        return Response(payload)


class UserStatsView(APIView):
    """Any authenticated user: stats scoped to their own executions only."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        range_param = request.query_params.get("range", "30d")
        execs = Execution.objects.filter(
            _date_filter(range_param),
            launched_by=request.user,
        )

        payload = _build_stats_payload(execs, range_param)

        # User-specific extra: last execution info
        last_exec = (
            Execution.objects.filter(launched_by=request.user)
            .order_by("-launched_at")
            .values("id", "etl__name", "status", "launched_at", "completed_at")
            .first()
        )
        if last_exec and last_exec["launched_at"]:
            last_exec["launched_at"] = last_exec["launched_at"].isoformat()
        if last_exec and last_exec["completed_at"]:
            last_exec["completed_at"] = last_exec["completed_at"].isoformat()

        payload["last_execution"] = last_exec
        return Response(payload)