#!/bin/sh
set -e

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
except Exception:
    sys.exit(1)
" 2>/dev/null; do
  sleep 1
done
echo "[entrypoint] database ready."

# Apply migrations on every boot (idempotent).
python manage.py migrate --noinput

# Collect static for the Django admin (whitenoise serves them).
python manage.py collectstatic --noinput --clear

# Create superuser ONCE if env vars set AND no superuser exists.
# Use INITIAL_SUPERUSER_USERNAME + INITIAL_SUPERUSER_PASSWORD on first deploy,
# then unset them in your .env so they're not re-applied.
if [ -n "${INITIAL_SUPERUSER_USERNAME:-}" ] && [ -n "${INITIAL_SUPERUSER_PASSWORD:-}" ]; then
  python - <<'PY'
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()
from apps.users.models import UserProfile
username = os.environ['INITIAL_SUPERUSER_USERNAME']
if not UserProfile.objects.filter(is_superuser=True).exists():
    u, _ = UserProfile.objects.update_or_create(
        username=username,
        defaults={
            'email': os.environ.get('INITIAL_SUPERUSER_EMAIL', f'{username}@example.com'),
            'is_manager': True,
            'is_staff': True,
            'is_superuser': True,
        },
    )
    u.set_password(os.environ['INITIAL_SUPERUSER_PASSWORD'])
    u.save()
    print(f'[entrypoint] superuser {username} created')
else:
    print('[entrypoint] superuser already exists, skipping creation')
PY
fi

exec "$@"
