"""Idempotent admin seed for production deploys (Railway).

Reads ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_DISPLAY_NAME from the
environment and ensures an `admin` row exists in `users`. Safe to run
on every boot:

- If ADMIN_EMAIL/PASSWORD are not set → no-op (logs a warning, exits 0).
- If the user does not exist → creates it with role='admin'.
- If it exists with a different password → updates the hash so rotating
  ADMIN_PASSWORD in Railway propagates on next deploy.
- If it exists with the same password → no-op.

Runs OUTSIDE the FastAPI app to avoid coupling boot to a request loop —
this script owns its own engine/session and disposes them cleanly.
"""

from __future__ import annotations

import asyncio
import os
import re
import sys
from datetime import UTC, datetime

import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

# Importamos el paquete `app.models` (no solo User) para forzar el registro
# de TODOS los mappers SQLAlchemy. Sin esto, cualquier futuro acceso a
# `user.consents` o `user.sessions` tiraria InvalidRequestError porque los
# mappers referenciados por string ("Consent", "Session") no estarian
# resueltos.
from app import models  # noqa: F401
from app.core.config import settings
from app.models.user import User

# Mismas reglas que `RegisterRequest.validate_password_strength`. Sin esto,
# el admin (la cuenta de mayor privilegio) podria tener un password mas
# debil que cualquier estudiante — auditoria/pen-test lo marcaria primero.
_PASSWORD_RULES = [
    (lambda p: len(p) >= 8, "minimo 8 caracteres"),
    (lambda p: re.search(r"[A-Z]", p) is not None, "al menos 1 mayuscula"),
    (lambda p: re.search(r"[0-9]", p) is not None, "al menos 1 numero"),
    (lambda p: re.search(r"[^a-zA-Z0-9]", p) is not None, "al menos 1 caracter especial"),
]


def _validate_password(password: str) -> list[str]:
    return [msg for check, msg in _PASSWORD_RULES if not check(password)]


def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


async def seed_admin() -> int:
    email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
    password = os.environ.get("ADMIN_PASSWORD", "")
    display_name = os.environ.get("ADMIN_DISPLAY_NAME", "Administrador").strip() or "Administrador"

    if not email or not password:
        print("[seed_admin] ADMIN_EMAIL/ADMIN_PASSWORD not set — skipping.")
        return 0

    failures = _validate_password(password)
    if failures:
        print(
            "[seed_admin] ADMIN_PASSWORD no cumple politica — "
            + ", ".join(failures)
            + ". Aborto el seed para no introducir credenciales debiles."
        )
        return 1

    engine = create_async_engine(settings.DATABASE_URL, future=True)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with Session() as db:
            result = await db.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()

            if user is None:
                user = User(
                    email=email,
                    hashed_password=_hash(password),
                    display_name=display_name,
                    role="admin",
                    created_at=datetime.now(UTC),
                )
                db.add(user)
                await db.commit()
                print(f"[seed_admin] created admin {email}")
                return 0

            # Compliance: si la cuenta fue deshabilitada explicitamente
            # via panel admin (`disabled_at` seteado), NO la re-activamos
            # silenciosamente — eso anularia una revocacion humana sin
            # audit_log. Para re-activarla, el operador debe limpiar el
            # disabled_at manualmente (o via panel) primero.
            if user.disabled_at is not None:
                print(
                    f"[seed_admin] admin {email} esta deshabilitada "
                    f"(disabled_reason={user.disabled_reason!r}). "
                    "No se modifica. Reactivar via panel admin si procede."
                )
                return 0

            changed = False
            if user.role != "admin":
                user.role = "admin"
                changed = True
            if not _verify(password, user.hashed_password):
                user.hashed_password = _hash(password)
                changed = True

            if changed:
                await db.commit()
                print(f"[seed_admin] updated admin {email}")
            else:
                print(f"[seed_admin] admin {email} already up-to-date")
            return 0
    finally:
        await engine.dispose()


def main() -> None:
    sys.exit(asyncio.run(seed_admin()))


if __name__ == "__main__":
    main()
