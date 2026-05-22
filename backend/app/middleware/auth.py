import uuid
from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User
from app.repositories.consent_repository import ConsentRepository
from app.repositories.consent_version_repository import ConsentVersionRepository
from app.repositories.user_repository import UserRepository
from app.services.consent_service import ConsentService

bearer_scheme = HTTPBearer(auto_error=False)

JWT_ALGORITHM = "HS256"


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db=Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autenticado")

    try:
        payload = jwt.decode(credentials.credentials, settings.JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalido")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalido")

    repo = UserRepository(db)
    user = await repo.get_by_id(uuid.UUID(user_id))

    if not user or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalido")

    return user


def require_role(role: str) -> Callable:
    async def role_dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role != role:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso denegado")
        return current_user

    return role_dependency


require_admin = require_role("admin")


async def require_consent(
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
) -> User:
    if current_user.role == "admin":
        return current_user

    consent_repo = ConsentRepository(db)
    version_repo = ConsentVersionRepository(db)
    # `db` is now required by ConsentService — passed even though this
    # middleware only reads (get_consent_status), so the type contract is
    # honored uniformly across callers.
    service = ConsentService(consent_repo, version_repo, db=db)

    status_response = await service.get_consent_status(current_user.id)

    if status_response.status != "ok":
        raise HTTPException(
            status_code=403,
            detail={
                "message": "Consentimiento requerido",
                "consent_status": status_response.status,
            },
        )

    return current_user
