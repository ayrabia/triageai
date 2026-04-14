import enum


class ReferralStatus(str, enum.Enum):
    PENDING = "pending"
    FAILED = "failed"       # pipeline error — needs manual review
    REVIEWED = "reviewed"
    APPROVED = "approved"
    ESCALATED = "escalated"
    ARCHIVED = "archived"


class ReferralAction(str, enum.Enum):
    PRIORITY_REVIEW = "PRIORITY REVIEW"
    SECONDARY_APPROVAL = "SECONDARY APPROVAL"
    STANDARD_QUEUE = "STANDARD QUEUE"


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    COORDINATOR = "coordinator"
    REVIEWER = "reviewer"
