"""
User routes — currently just /me for the frontend to load the authenticated
user's profile and clinic info after login.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from db.enums import UserRole
from db.models import Clinic, User

router = APIRouter()


class MeResponse(BaseModel):
    id: UUID
    email: str
    name: str
    role: str
    clinic_id: UUID
    clinic_name: str
    clinic_specialty: str


class PhysicianItem(BaseModel):
    id: UUID
    name: str
    email: str

    model_config = ConfigDict(from_attributes=True)


@router.get("/physicians", response_model=list[PhysicianItem])
def get_physicians(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return all physicians provisioned at the caller's clinic.
    Used by the route modal to populate the physician picker.
    """
    return (
        db.query(User)
        .filter(User.clinic_id == current_user.clinic_id, User.role == UserRole.PHYSICIAN)
        .order_by(User.name)
        .all()
    )


@router.get("/me", response_model=MeResponse)
def get_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return the authenticated user's profile and clinic info.
    Called by the frontend immediately after login to load clinic branding.
    """
    clinic = db.get(Clinic, current_user.clinic_id)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User's clinic not found",
        )
    return MeResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        role=current_user.role.value,
        clinic_id=current_user.clinic_id,
        clinic_name=clinic.name,
        clinic_specialty=clinic.specialty,
    )
