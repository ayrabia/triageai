import enum


class ReferralStatus(str, enum.Enum):
    PENDING = "pending"
    FAILED = "failed"
    READY = "ready"
    REVIEWED = "reviewed"
    APPROVED = "approved"
    ESCALATED = "escalated"
    ESCALATED_TO_MD = "escalated_to_md"
    MD_REVIEWED = "md_reviewed"
    APPROVED_FOR_SCHEDULING = "approved_for_scheduling"
    SCHEDULED = "scheduled"
    ARCHIVED = "archived"
    ROUTED = "routed"


class ReferralAction(str, enum.Enum):
    PRIORITY_REVIEW = "PRIORITY REVIEW"
    SECONDARY_APPROVAL = "SECONDARY APPROVAL"
    STANDARD_QUEUE = "STANDARD QUEUE"


class UserRole(str, enum.Enum):
    SUPERADMIN = "superadmin"
    ADMIN = "admin"
    COORDINATOR = "coordinator"
    REVIEWER = "reviewer"
    PHYSICIAN = "physician"
