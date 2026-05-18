"""Monthly reporting: aggregates per collaborator."""
from __future__ import annotations

import csv
import io
from datetime import date as date_type
from decimal import Decimal
from typing import Iterable

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def build_monthly_rows(users, start: date_type, end: date_type) -> list[dict]:
    """Return a list of per-user dicts for the given inclusive [start, end] range.

    `worked_minutes` inclut le trajet pro compensable (Art. 13 al. 3 OLT 1)
    des missions FIELD ayant des sessions sur la période. Le détail brut
    (pointage seul) est exposé dans `clocked_minutes` et le trajet dans
    `travel_compensable_minutes` pour la transparence du rapport.
    """
    from services.missions_travel import period_travel_compensable_minutes
    from apps.clocking.models import ClockSession
    from django.db.models import Count, Q, Sum, IntegerField
    from django.db.models.functions import Coalesce

    user_ids = [u.id for u in users]
    # Une seule requête agrégée pour tous les users : remplace 3 queries × N users.
    stats_by_user = {
        row["user_id"]: row
        for row in ClockSession.objects
            .filter(
                user_id__in=user_ids,
                clock_in__date__gte=start,
                clock_in__date__lte=end,
            )
            .values("user_id")
            .annotate(
                clocked_minutes=Coalesce(
                    Sum(
                        "duration_minutes" if False else  # placeholder
                        "id",  # we'll compute below as we can't sum a property
                    ),
                    0,
                ),
                # Django ne peut pas sommer `duration_minutes` (property Python).
                # On compte simplement et somme via expression equivalente :
                # diff_minutes = EXTRACT(EPOCH FROM clock_out_rounded - clock_in_rounded) / 60
                # — fait via raw expression ci-dessous.
                sessions_count=Count(
                    "id", filter=Q(clock_out_rounded__isnull=False),
                ),
                open_count=Count("id", filter=Q(clock_out__isnull=True)),
                forgotten_count=Count("id", filter=Q(is_forgotten=True)),
            )
    }
    # Pour `clocked_minutes`, on doit calculer via une expression DB.
    # Django ne supporte pas Sum sur une property, donc on charge les durations.
    from django.db.models import F, ExpressionWrapper, DurationField
    sessions_durations = (
        ClockSession.objects
        .filter(
            user_id__in=user_ids,
            clock_in__date__gte=start,
            clock_in__date__lte=end,
            clock_out_rounded__isnull=False,
        )
        .annotate(
            dur=ExpressionWrapper(
                F("clock_out_rounded") - F("clock_in_rounded"),
                output_field=DurationField(),
            ),
        )
        .values("user_id")
        .annotate(total=Sum("dur"))
    )
    clocked_by_user = {
        row["user_id"]: int(row["total"].total_seconds() // 60) if row["total"] else 0
        for row in sessions_durations
    }

    rows = []
    for user in users:
        s = stats_by_user.get(user.id, {})
        clocked_min = clocked_by_user.get(user.id, 0)
        travel_min = period_travel_compensable_minutes(user, start, end)
        worked_min = clocked_min + travel_min
        vacation_remaining = Decimal(user.vacation_quota) - user.vacation_used
        rows.append({
            "user_id": user.id,
            "username": user.get_username(),
            "worked_minutes": worked_min,
            "worked_hours": round(worked_min / 60, 2),
            "clocked_minutes": clocked_min,
            "travel_compensable_minutes": travel_min,
            "sessions_count": s.get("sessions_count", 0),
            "open_sessions": s.get("open_count", 0),
            "forgotten_sessions": s.get("forgotten_count", 0),
            "overtime_balance_hours": float(user.overtime_balance),
            "vacation_quota": user.vacation_quota,
            "vacation_used": float(user.vacation_used),
            "vacation_remaining": float(vacation_remaining),
            "weekly_target_hours": float(user.weekly_target_hours),
        })
    return rows


CSV_HEADERS = [
    "username", "sessions_count", "worked_hours", "overtime_balance_hours",
    "forgotten_sessions", "open_sessions",
    "vacation_quota", "vacation_used", "vacation_remaining",
]


def rows_to_csv(rows: Iterable[dict]) -> bytes:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=CSV_HEADERS)
    writer.writeheader()
    for r in rows:
        writer.writerow({k: r[k] for k in CSV_HEADERS})
    return buf.getvalue().encode("utf-8")


def rows_to_pdf(rows: list[dict], start: date_type, end: date_type) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=landscape(A4),
        leftMargin=1.5 * cm, rightMargin=1.5 * cm,
        topMargin=1.5 * cm, bottomMargin=1.5 * cm,
        title=f"Rapport {start:%Y-%m}",
    )
    styles = getSampleStyleSheet()
    story = [
        Paragraph(f"Rapport mensuel — {start:%B %Y}", styles["Title"]),
        Paragraph(f"Période : {start} → {end}", styles["Italic"]),
        Spacer(1, 0.4 * cm),
    ]

    table_data = [[
        "Utilisateur", "Sessions", "Heures travaillées",
        "Solde heures sup", "Oublis", "Sessions ouvertes",
        "Quota congés", "Congés utilisés", "Congés restants",
    ]]
    for r in rows:
        table_data.append([
            r["username"],
            r["sessions_count"],
            f"{r['worked_hours']:.2f}",
            f"{r['overtime_balance_hours']:+.2f}",
            r["forgotten_sessions"],
            r["open_sessions"],
            r["vacation_quota"],
            f"{r['vacation_used']:.1f}",
            f"{r['vacation_remaining']:.1f}",
        ])

    table = Table(table_data, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e5e7eb")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
    ]))
    story.append(table)
    doc.build(story)
    return buf.getvalue()
