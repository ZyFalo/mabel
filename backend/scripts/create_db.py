"""Create the mabel_ia database and enable pgcrypto extension.

Usage: python scripts/create_db.py
Connects to the default 'postgres' database to create 'mabel_ia'.
Uses asyncpg directly (no dependency on psql CLI being in PATH).
"""

import asyncio
import sys

import asyncpg


async def main():
    db_name = "mabel_ia"
    user = "williampena"
    password = "0416"
    host = "localhost"
    port = 5432

    # Connect to default 'postgres' database to create mabel_ia
    try:
        conn = await asyncpg.connect(user=user, password=password, host=host, port=port, database="postgres")
    except Exception as e:
        print(f"Cannot connect to PostgreSQL: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        exists = await conn.fetchval(f"SELECT 1 FROM pg_database WHERE datname='{db_name}'")
        if exists:
            print(f"Database '{db_name}' already exists.")
        else:
            await conn.execute(f'CREATE DATABASE "{db_name}"')
            print(f"Database '{db_name}' created.")
    finally:
        await conn.close()

    # Connect to mabel_ia to enable pgcrypto
    conn = await asyncpg.connect(user=user, password=password, host=host, port=port, database=db_name)
    try:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
        print("pgcrypto extension enabled.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
