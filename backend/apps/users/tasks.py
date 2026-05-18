"""Celery tasks for the users app — currently: weekly LPD retention sweep."""
from __future__ import annotations

import logging

from celery import shared_task
from django.core.cache import cache
from django.db import OperationalError

logger = logging.getLogger(__name__)


def _with_lock(lock_key: str, timeout_s: int = 1800):
    """Lock distribué Redis : empêche deux purges parallèles (data loss risque)."""
    def deco(fn):
        def wrapper(*args, **kwargs):
            acquired = cache.add(lock_key, "1", timeout_s)
            if not acquired:
                logger.warning("Task %s already running (lock %s held).", fn.__name__, lock_key)
                return {"skipped": True, "reason": "locked"}
            try:
                return fn(*args, **kwargs)
            finally:
                cache.delete(lock_key)
        wrapper.__name__ = fn.__name__
        return wrapper
    return deco


@shared_task(
    name="apps.users.tasks.purge_old_data_task",
    bind=True,
    autoretry_for=(OperationalError,),
    retry_kwargs={"max_retries": 2, "countdown": 300},
)
@_with_lock("lock:purge_old_data", timeout_s=3600)
def purge_old_data_task(self=None) -> dict:
    """Hebdomadaire (dimanche 03h) — exécute la purge LPD via le helper partagé.

    Lock distribué + retry SQL : la purge est sensible (destruction de données).
    On préfère bail out plutôt que dupliquer un cleanup partiel.
    """
    from apps.users.management.commands.purge_old_data import run_purge

    result = run_purge(dry_run=False)
    logger.warning(
        "purge_old_data_task: %s",
        {k: v for k, v in result["counts"].items() if v},
    )
    return result
