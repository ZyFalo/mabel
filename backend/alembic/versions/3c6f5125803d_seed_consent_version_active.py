"""seed_consent_version_active

Revision ID: 3c6f5125803d
Revises: 08b6189ffc35
Create Date: 2026-03-07 10:06:20.702905

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3c6f5125803d'
down_revision: Union[str, Sequence[str], None] = '08b6189ffc35'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO consent_versions (id, version, title, body, status, published_at, created_at)
        VALUES (
            gen_random_uuid(),
            '1.0',
            'Consentimiento Informado — Mabel IA',
            'CONSENTIMIENTO INFORMADO PARA PARTICIPACION EN PROYECTO DE INVESTIGACION

Proyecto: Mabel IA — Asistente Virtual de Apoyo Psicoeducativo
Institucion: Universidad Manuela Beltran (UMB), Bogota, Colombia
Investigadores: Equipo de Tesis — Ingenieria de Software, 2025

De acuerdo con la Ley 1581 de 2012 (Proteccion de Datos Personales) y el Decreto 1377 de 2013, se le informa que:

1. PROPOSITO: Este proyecto desarrolla un asistente virtual con inteligencia artificial para brindar apoyo psicoeducativo a estudiantes universitarios. NO reemplaza atencion profesional en salud mental.

2. DATOS RECOPILADOS: Correo electronico institucional, nombre, preferencias de uso, historial de conversaciones (opcional), y respuestas a instrumentos de evaluacion (SUS, rubrica de empatia, bienestar percibido).

3. USO DE DATOS:
   - Solo uso: Sus datos se utilizan unicamente para el funcionamiento del sistema.
   - Uso + mejora anonima: Adicionalmente, datos anonimizados podran usarse para mejorar el servicio.

4. DERECHOS ARCO: Usted tiene derecho a Acceder, Rectificar, Cancelar y Oponerse al tratamiento de sus datos personales en cualquier momento.

5. PARTICIPACION VOLUNTARIA: Su participacion es completamente voluntaria. Puede revocar este consentimiento en cualquier momento sin consecuencias academicas.

6. CONFIDENCIALIDAD: Los datos seran tratados de forma confidencial y almacenados con medidas de seguridad apropiadas.

7. RIESGO: Esta investigacion se clasifica como de riesgo minimo segun la Resolucion 8430 de 1993.

8. CONTACTO: Para consultas sobre el tratamiento de sus datos, contacte al equipo de investigacion a traves de los canales institucionales de la UMB.',
            'active',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        )
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM consent_versions WHERE version = '1.0'")
