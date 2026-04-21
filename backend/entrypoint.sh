#!/bin/sh
set -e

# Wait for Postgres (db service depends_on with healthcheck handles this in compose,
# but a small belt-and-braces loop here protects against race conditions on first run).
echo "[entrypoint] waiting for database…"
until python -c "
import os, sys
from urllib.parse import urlparse
import psycopg
url = urlparse(os.environ['DATABASE_URL'])
try:
    psycopg.connect(
        host=url.hostname, port=url.port or 5432,
        user=url.username, password=url.password, dbname=url.path.lstrip('/'),
        connect_timeout=2,
    ).close()
except Exception as e:
    sys.exit(1)
" 2>/dev/null; do
  sleep 1
done
echo "[entrypoint] database ready."

# Apply migrations on every boot (idempotent).
python manage.py migrate --noinput

# Seed demo data on first boot only (the seed command itself is idempotent,
# so re-running is safe — but we guard via SKIP_SEED env to opt out).
if [ "${SKIP_SEED:-0}" != "1" ]; then
  echo "[entrypoint] seeding demo data…"
  python manage.py seed_demo
fi

# Create / refresh the default admin (superuser, can self-approve, "big manager").
python - <<'PY'
import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()
from apps.users.models import UserProfile
admin, _ = UserProfile.objects.update_or_create(
    username='admin',
    defaults={
        'email': 'admin@example.com',
        'is_manager': True,
        'is_staff': True,
        'is_superuser': True,
    },
)
admin.set_password('changeme')
admin.save()
print('[entrypoint] admin / changeme ready')
PY

exec "$@"
