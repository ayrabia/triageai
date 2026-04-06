"""
Database session management.

Usage in FastAPI routes:
    from db.session import get_db
    from sqlalchemy.orm import Session

    @router.get("/example")
    def example(db: Session = Depends(get_db)):
        ...
"""

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.environ["DATABASE_URL"]

engine = create_engine(
    DATABASE_URL,
    # Keep a small pool — RDS t4g.micro has a low max_connections limit
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,  # reconnect if the RDS instance restarted
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """FastAPI dependency that yields a DB session and closes it when done."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
