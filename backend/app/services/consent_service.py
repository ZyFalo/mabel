import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.consent_repository import ConsentRepository
from app.repositories.consent_version_repository import ConsentVersionRepository
from app.schemas.consent import ConsentResponse, ConsentStatusResponse, ConsentVersionResponse
from app.services.audit_service import audit_log_action


class ConsentService:
    """Atomic consent operations.

    D-12 enforced strictly: every write path (`accept_consent`,
    `patch_consent`) bundles the consent row mutation AND the matching
    `audit_log_action` in a single transaction so we never leave a consent
    change persisted without its audit trail. The repo no longer commits
    by itself (see `ConsentRepository.create`/`update`), and `db` is no
    longer optional — read-only callers can pass any active session.
    """

    def __init__(
        self,
        consent_repo: ConsentRepository,
        version_repo: ConsentVersionRepository,
        db: AsyncSession,
    ):
        self.consent_repo = consent_repo
        self.version_repo = version_repo
        # Required (not Optional) so that the atomicity guarantee holds for
        # every caller. Previous signature accepted None and silently
        # skipped the audit log — a recipe for evidence-chain corruption
        # under Ley 1581/2012.
        self.db = db

    async def get_active_version(self) -> ConsentVersionResponse | None:
        version = await self.version_repo.get_active()
        if not version:
            return None
        return ConsentVersionResponse.model_validate(version)

    async def accept_consent(
        self,
        user_id: uuid.UUID,
        consent_version_id: uuid.UUID,
        scope: str,
        ip: str | None = None,
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
        await audit_log_action(
            self.db,
            actor_id=user_id,
            actor_role="student",
            action="consent_granted",
            target_type="consent",
            target_id=consent.id,
            details={"scope": scope, "version_id": str(consent_version_id)},
            ip=ip,
        )
        # Single commit covers both the consent row and the audit log,
        # guaranteeing atomicity: if the audit write fails, the consent
        # never persists either.
        await self.db.commit()
        await self.db.refresh(consent)
        return ConsentResponse.model_validate(consent)

    async def patch_consent(
        self,
        user_id: uuid.UUID,
        action: str,
        scope: str | None = None,
        ip: str | None = None,
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
                accepted_at=datetime.now(UTC),
            )
            await self._audit_consent_change(
                user_id=user_id,
                consent_id=consent.id,
                action="consent_granted",
                details={
                    "scope": scope,
                    "version_id": str(active_version.id),
                    "operation": "re-accept",
                },
                ip=ip,
            )
            return ConsentResponse.model_validate(consent)

        if action == "reduce-scope":
            if existing.revoked_at is not None:
                raise ValueError("CONSENT_REVOKED")
            if existing.scope == "solo_uso":
                raise ValueError("ALREADY_SOLO_USO")
            consent = await self.consent_repo.update(existing, scope="solo_uso")
            await self._audit_consent_change(
                user_id=user_id,
                consent_id=consent.id,
                action="consent_granted",
                details={
                    "scope": "solo_uso",
                    "version_id": str(active_version.id),
                    "operation": "reduce-scope",
                },
                ip=ip,
            )
            return ConsentResponse.model_validate(consent)

        if action == "revoke":
            if existing.revoked_at is not None:
                raise ValueError("ALREADY_REVOKED")
            consent = await self.consent_repo.update(
                existing, revoked_at=datetime.now(UTC)
            )
            await self._audit_consent_change(
                user_id=user_id,
                consent_id=consent.id,
                action="consent_revoked",
                details={"version_id": str(active_version.id)},
                ip=ip,
            )
            return ConsentResponse.model_validate(consent)

        raise ValueError("UNSUPPORTED_ACTION")

    async def _audit_consent_change(
        self,
        *,
        user_id: uuid.UUID,
        consent_id: uuid.UUID,
        action: str,
        details: dict,
        ip: str | None,
    ) -> None:
        """Emit the audit log row for a consent mutation and commit ATOMICALLY
        with the repo's pending changes.

        Per D-12 the repo no longer commits by itself — its `update()` only
        flushes — so this single commit covers both the consent row change
        and the audit_log row. If `audit_log_action` raises (constraint,
        ALLOWED_ACTIONS regression, transient DB error), the commit never
        runs and the whole transaction rolls back, preserving the invariant
        that every consent change has its matching audit entry.
        """
        await audit_log_action(
            self.db,
            actor_id=user_id,
            actor_role="student",
            action=action,
            target_type="consent",
            target_id=consent_id,
            details=details,
            ip=ip,
        )
        await self.db.commit()

    async def get_consent_status(self, user_id: uuid.UUID) -> ConsentStatusResponse:
        # NOTE: this helper does NOT discriminate by user.role. That is
        # intentional and safe because callers already gate on role:
        #
        # - `middleware.auth.require_consent` short-circuits with
        #   `if current_user.role == "admin": return current_user`
        #   BEFORE calling this function, so admins never reach here in
        #   the request-scoped auth path.
        # - Admin routes (`/admin/*`) live outside `<ConsentGuard />`
        #   in the React router (see frontend/src/App.tsx), so the
        #   admin UI never calls `/users/me/consent-status` either.
        #
        # If a future caller invokes this directly for an admin user,
        # behavior is "evaluate normally" — they'd get whatever
        # consent state is stored. Operationally admins should have NO
        # consent rows (cleaned 2026-05-23), so an admin would get
        # `status='no_consent'`. That is correct fail-safe behavior.
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

        return ConsentStatusResponse(status="ok", scope=latest.scope)
