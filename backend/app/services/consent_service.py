import uuid
from datetime import datetime, timezone

from app.repositories.consent_repository import ConsentRepository
from app.repositories.consent_version_repository import ConsentVersionRepository
from app.schemas.consent import ConsentResponse, ConsentStatusResponse, ConsentVersionResponse


class ConsentService:
    def __init__(
        self,
        consent_repo: ConsentRepository,
        version_repo: ConsentVersionRepository,
    ):
        self.consent_repo = consent_repo
        self.version_repo = version_repo

    async def get_active_version(self) -> ConsentVersionResponse | None:
        version = await self.version_repo.get_active()
        if not version:
            return None
        return ConsentVersionResponse.model_validate(version)

    async def accept_consent(
        self, user_id: uuid.UUID, consent_version_id: uuid.UUID, scope: str
    ) -> ConsentResponse:
        version = await self.version_repo.get_by_id(consent_version_id)
        if not version or version.status != "active":
            raise ValueError("INVALID_VERSION")

        existing = await self.consent_repo.get_by_user_and_version(user_id, consent_version_id)
        if existing:
            raise ValueError("DUPLICATE_CONSENT")

        consent = await self.consent_repo.create(
            user_id=user_id, consent_version_id=consent_version_id, scope=scope
        )
        return ConsentResponse.model_validate(consent)

    async def patch_consent(
        self, user_id: uuid.UUID, action: str, scope: str | None = None
    ) -> ConsentResponse:
        active_version = await self.version_repo.get_active()
        if not active_version:
            raise ValueError("NO_ACTIVE_VERSION")

        existing = await self.consent_repo.get_by_user_and_version(
            user_id, active_version.id
        )
        if not existing:
            raise ValueError("NO_CONSENT_FOR_VERSION")

        if action == "re-accept":
            if existing.revoked_at is None:
                raise ValueError("ALREADY_ACTIVE")
            if scope is None:
                raise ValueError("SCOPE_REQUIRED")

            consent = await self.consent_repo.update(
                existing,
                revoked_at=None,
                scope=scope,
                accepted_at=datetime.now(timezone.utc),
            )
            return ConsentResponse.model_validate(consent)

        if action == "reduce-scope":
            if existing.revoked_at is not None:
                raise ValueError("CONSENT_REVOKED")
            if existing.scope == "solo_uso":
                raise ValueError("ALREADY_SOLO_USO")
            consent = await self.consent_repo.update(existing, scope="solo_uso")
            return ConsentResponse.model_validate(consent)

        if action == "revoke":
            if existing.revoked_at is not None:
                raise ValueError("ALREADY_REVOKED")
            consent = await self.consent_repo.update(
                existing, revoked_at=datetime.now(timezone.utc)
            )
            return ConsentResponse.model_validate(consent)

        raise ValueError("UNSUPPORTED_ACTION")

    async def get_consent_status(self, user_id: uuid.UUID) -> ConsentStatusResponse:
        active_version = await self.version_repo.get_active()
        if not active_version:
            return ConsentStatusResponse(status="no_consent")

        latest = await self.consent_repo.get_latest_by_user(user_id)

        if not latest:
            return ConsentStatusResponse(status="no_consent")

        if latest.revoked_at is not None:
            return ConsentStatusResponse(status="revoked")

        if latest.consent_version_id != active_version.id:
            return ConsentStatusResponse(
                status="new_version_required",
                current_version=None,
                new_version=active_version.version,
            )

        return ConsentStatusResponse(status="ok")
