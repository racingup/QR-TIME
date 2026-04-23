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
    """Return a list of per-user dicts for the given inclusive [start, end] range."""
    rows = []
    for user in users:
        sessions = user.sessions.filter(
            clock_in__date__gte=start,
            clock_in__date__lte=end,
            clock_out_rounded__isnull=False,
        )
        worked_min = sum(s.duration_minutes for s in sessions)
        open_count = user.sessions.filter(
            clock_in__date__gte=start,
            clock_in__date__lte=end,
            clock_out__isnull=True,
        ).count()
        forgotten = user.sessions.filter(
            clock_in__date__gte=start,
            clock_in__date__lte=end,
            is_forgotten=True,
        ).count()
        vacation_remaining = Decimal(user.vacation_quota) - user.vacation_used
        rows.append({
            "user_id": user.id,
            "username": user.get_username(),
            "worked_minutes": worked_min,
            "worked_hours": round(worked_min / 60, 2),
            "sessions_count": sessions.count(),
            "open_sessions": open_count,
            "forgotten_sessions": forgotten,
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
