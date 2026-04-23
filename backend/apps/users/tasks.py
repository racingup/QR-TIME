"""Celery tasks for the users app — currently: weekly LPD retention sweep."""
from __future__ import annotations

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name="apps.users.tasks.purge_old_data_task")
def purge_old_data_task() -> dict:
    """Hebdomadaire (dimanche 03h) — exécute la purge LPD via le helper partagé."""
    from apps.users.management.commands.purge_old_data import run_purge

    result = run_purge(dry_run=False)
    logger.warning(
        "purge_old_data_task: %s",
        {k: v for k, v in result["counts"].items() if v},
    )
    return result
