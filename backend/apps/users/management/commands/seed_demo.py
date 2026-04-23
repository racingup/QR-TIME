"""Seed the database with demo data for local development & UI tests.

Idempotent: re-running updates existing rows in place. Safe on a populated DB.

Usage:
    python manage.py seed_demo
"""
from __future__ import annotations

from datetime import datetime, time, timedelta, timezone as dt_timezone
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.absences.models import AbsenceRequest
from apps.clocking.models import ClockSession, FixedTimeSlot
from apps.missions.models import Mission
from apps.users.models import Site, ToleranceConfig, UserProfile

# Notre-Dame de Paris — a real, recognisable point.
SITE_LAT = Decimal("48.853000")
SITE_LON = Decimal("2.349900")


class Command(BaseCommand):
    help = "Seed the database with demo data (idempotent)."

    def handle(self, *args, **options):
        out = self.stdout

        # ── Users ──────────────────────────────────────────────────────
        manager = self._upsert_user(
            "claire", "password123",
            email="claire@example.com",
            is_manager=True,
            weekly_target_hours=Decimal("42.00"),
            vacation_quota=30,
        )
        alice = self._upsert_user(
            "alice", "password123",
            email="alice@example.com",
            is_manager=False,
            weekly_target_hours=Decimal("42.00"),
            vacation_quota=25,
        )
        bob = self._upsert_user(
            "bob", "password123",
            email="bob@example.com",
            is_manager=False,
            weekly_target_hours=Decimal("21.00"),  # part-time
            vacation_quota=25,
        )
        out.write(f"  ✓ users: claire (manager), alice, bob (employees)")

        # ── Site ───────────────────────────────────────────────────────
        site, _ = Site.objects.update_or_create(
            name="Siège Paris",
            defaults={
                "latitude": SITE_LAT,
                "longitude": SITE_LON,
                "gps_radius_meters": 200,
                # Stable, predictable token for demo logins.
                "qr_code_token": "demo-site-paris-token",
            },
        )
        out.write(f"  ✓ site: {site.name} ({SITE_LAT}, {SITE_LON}) radius={site.gps_radius_meters}m")

        # ── Tolerance + fixed slot ─────────────────────────────────────
        ToleranceConfig.objects.update_or_create(
            pk=1,
            defaults={"tolerance_minutes": 5, "rounding_direction": "NEAREST"},
        )
        FixedTimeSlot.objects.update_or_create(
            name="Plage matinale",
            defaults={"start_time": time(9, 30), "end_time": time(11, 30), "is_active": True},
        )
        FixedTimeSlot.objects.update_or_create(
            name="Plage après-midi",
            defaults={"start_time": time(14, 0), "end_time": time(16, 0), "is_active": True},
        )
        out.write("  ✓ tolerance config + 2 fixed slots")

        # ── Approved mission (alice, today, REMOTE) ───────────────────
        today = timezone.localdate()
        # Use the unique qr_token as the lookup key so re-seeding on a
        # different `today` updates the same row instead of duplicating.
        mission, _ = Mission.objects.update_or_create(
            qr_token="demo-mission-alice-token",
            defaults={
                "user": alice,
                "mission_type": Mission.Type.REMOTE,
                "date_start": today,
                "date_end": today,
                "status": Mission.Status.APPROVED,
                "approved_by": manager,
                "manager_comment": "OK pour télétravail aujourd'hui.",
            },
        )
        out.write(f"  ✓ approved mission for alice (token: {mission.qr_token})")

        # ── Pending absence (bob, next week, VACATION) ────────────────
        absence_start = today + timedelta(days=7)
        AbsenceRequest.objects.update_or_create(
            user=bob, absence_type=AbsenceRequest.AbsenceType.VACATION,
            date_start=absence_start,
            defaults={
                "date_end": absence_start + timedelta(days=4),
                "status": AbsenceRequest.Status.PENDING,
            },
        )
        out.write(f"  ✓ pending absence for bob ({absence_start} → +5 days)")

        # ── Clock sessions for alice (yesterday with overtime) ─────────
        # Wipe alice's prior demo sessions (idempotent re-seed).
        ClockSession.objects.filter(user=alice).delete()
        ClockSession.objects.filter(user=bob).delete()

        yesterday = today - timedelta(days=1)
        # alice: 9h00 → 12h30, 13h30 → 19h00 = 9h00 worked vs 8h24 target → +0.6h
        self._closed_session(alice, site, yesterday, 9, 0, 12, 30)
        self._closed_session(alice, site, yesterday, 13, 30, 19, 0)
        # alice today: in-progress (clock_in 9:00, no clock_out)
        ClockSession.objects.create(
            user=alice, site=site, session_type="OFFICE",
            clock_in=_localtime(today, 9, 0),
            clock_in_rounded=_localtime(today, 9, 0),
            gps_lat_in=SITE_LAT, gps_lon_in=SITE_LON,
        )

        # bob (part-time): yesterday 9h → 13h00 = 4h vs 4.2 target → -0.2h
        self._closed_session(bob, site, yesterday, 9, 0, 13, 0)

        out.write("  ✓ clock sessions: alice (+0.6h overtime, currently clocked in), bob (-0.2h)")

        # Update overtime balances to reflect what compute_overtime would have set.
        alice.overtime_balance = Decimal("0.60")
        alice.save(update_fields=["overtime_balance"])
        bob.overtime_balance = Decimal("-0.20")
        bob.save(update_fields=["overtime_balance"])

        out.write(self.style.SUCCESS("\nDemo data ready. Logins:"))
        out.write("  claire / password123  (manager)")
        out.write("  alice  / password123  (employee, 42h/week, currently clocked in)")
        out.write("  bob    / password123  (employee, 21h/week)")
        out.write(f"\nSite QR token:    demo-site-paris-token")
        out.write(f"Mission QR token: demo-mission-alice-token  (alice, REMOTE, today)")

    @staticmethod
    def _upsert_user(username, password, **defaults):
        user, created = UserProfile.objects.update_or_create(
            username=username, defaults=defaults,
        )
        user.set_password(password)
        user.save()
        return user

    @staticmethod
    def _closed_session(user, site, day, sh, sm, eh, em):
        start = _localtime(day, sh, sm)
        end = _localtime(day, eh, em)
        return ClockSession.objects.create(
            user=user, site=site, session_type="OFFICE",
            clock_in=start, clock_in_rounded=start,
            clock_out=end, clock_out_rounded=end,
            gps_lat_in=SITE_LAT, gps_lon_in=SITE_LON,
            gps_lat_out=SITE_LAT, gps_lon_out=SITE_LON,
        )


def _localtime(day, hour, minute):
    """Build a tz-aware datetime in the project's TIME_ZONE."""
    tz = timezone.get_current_timezone()
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=tz)
