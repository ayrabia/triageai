import enum


class ReferralStatus(str, enum.Enum):
    PENDING = "pending"
    REVIEWED = "reviewed"
    APPROVED = "approved"
    ESCALATED = "escalated"
    ARCHIVED = "archived"


class ReferralAction(str, enum.Enum):
    PRIORITY_REVIEW = "FLAGGED FOR PRIORITY REVIEW"
    SECONDARY_APPROVAL = "SECONDARY APPROVAL NEEDED"
    STANDARD_QUEUE = "STANDARD QUEUE"


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    COORDINATOR = "coordinator"
    REVIEWER = "reviewer"
