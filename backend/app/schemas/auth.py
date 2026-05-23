import re
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator


class RegisterRequest(BaseModel):
    email: str
    password: str
    display_name: str

    @field_validator("email")
    @classmethod
    def validate_umb_email(cls, v: str) -> str:
        # Cualquier `@umb.edu.co` puede registrarse via /register y por
        # default cae con role='student' (User.role server_default). El
        # admin se siembra via env vars (scripts/seed_admin.py) y bypassa
        # este validador. Para el MVP el riesgo de que profesores/staff
        # se auto-registren y contaminen la cohorte N=30 es bajo: la URL
        # del estudio se comparte solo con estudiantes seleccionados y
        # el panel admin permite revocar/eliminar cualquier cuenta.
        pattern = r"^[a-zA-Z0-9._%+-]+@umb\.edu\.co$"
        if not re.match(pattern, v):
            raise ValueError("El email debe ser institucional (@umb.edu.co)")
        return v.lower()

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("La contrasena debe tener al menos 8 caracteres")
        if not re.search(r"[A-Z]", v):
            raise ValueError("La contrasena debe tener al menos 1 mayuscula")
        if not re.search(r"[0-9]", v):
            raise ValueError("La contrasena debe tener al menos 1 numero")
        if not re.search(r"[^a-zA-Z0-9]", v):
            raise ValueError("La contrasena debe tener al menos 1 caracter especial")
        return v

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, v: str) -> str:
        if len(v.strip()) < 2:
            raise ValueError("El nombre debe tener al menos 2 caracteres")
        return v.strip()


class LoginRequest(BaseModel):
    email: str
    password: str
    remember_me: bool = False


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class ForgotPasswordRequest(BaseModel):
    email: str


class ForgotPasswordResponse(BaseModel):
    message: str
    reset_link: str | None = None


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("La contrasena debe tener al menos 8 caracteres")
        if not re.search(r"[A-Z]", v):
            raise ValueError("La contrasena debe tener al menos 1 mayuscula")
        if not re.search(r"[0-9]", v):
            raise ValueError("La contrasena debe tener al menos 1 numero")
        if not re.search(r"[^a-zA-Z0-9]", v):
            raise ValueError("La contrasena debe tener al menos 1 caracter especial")
        return v


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("La contrasena debe tener al menos 8 caracteres")
        if not re.search(r"[A-Z]", v):
            raise ValueError("La contrasena debe tener al menos 1 mayuscula")
        if not re.search(r"[0-9]", v):
            raise ValueError("La contrasena debe tener al menos 1 numero")
        if not re.search(r"[^a-zA-Z0-9]", v):
            raise ValueError("La contrasena debe tener al menos 1 caracter especial")
        return v


class TokenValidationResponse(BaseModel):
    valid: bool
    reason: str | None = None


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str | None
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}
