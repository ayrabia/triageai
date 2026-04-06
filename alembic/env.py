"""
Alembic environment configuration.

Reads DATABASE_URL from the environment (set in .env or shell).
Imports all ORM models so Alembic can detect schema changes for autogenerate.
"""

import os
import sys
from logging.config import fileConfig
from pathlib import Path

# Add the project root to sys.path so Alembic can import db.models
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Load .env so DATABASE_URL is available
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from alembic import context
from sqlalchemy import engine_from_config, pool

from db.models import Base  # noqa: F401 — registers all models on Base.metadata

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Override the sqlalchemy.url with DATABASE_URL from the environment
database_url = os.environ["DATABASE_URL"]
config.set_main_option("sqlalchemy.url", database_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations without a live DB connection (generates SQL script)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live DB connection."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
