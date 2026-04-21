"""Fixed-time-slot validation helpers.

A FixedTimeSlot defines a mandatory presence window (e.g. 09:30–11:30).
A clock-in arriving *after* a slot's start, or a clock-out leaving
*before* a slot's end, must be justified.
"""
from __future__ import annotations

from datetime import datetime
from typing import Iterable, Literal, Protocol


Action = Literal["IN", "OUT"]


class _SlotLike(Protocol):
    start_time: object  # datetime.time
    end_time: object


def requires_justification(
    moment: datetime,
    action: Action,
    slots: Iterable[_SlotLike],
) -> bool:
    """True iff the (rounded) moment violates any active fixed slot.

    For action=IN  : violated when the punch is *strictly after* any slot's start.
    For action=OUT : violated when the punch is *strictly before* any slot's end.
    """
    t = moment.time()
    if action == "IN":
        return any(t > slot.start_time for slot in slots)
    return any(t < slot.end_time for slot in slots)
