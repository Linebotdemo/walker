from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, Table
from sqlalchemy.orm import relationship, declarative_base
import datetime
from sqlalchemy.orm import Session


Base = declarative_base()

# 多対多: Organization - Area
organization_areas = Table(
    "organization_areas", Base.metadata,
    Column("organization_id", Integer, ForeignKey("organizations.id")),
    Column("area_id", Integer, ForeignKey("areas.id"))
)

class Area(Base):
    __tablename__ = "areas"
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)

    organizations = relationship("Organization", secondary=organization_areas, back_populates="areas")

class Organization(Base):
    __tablename__ = "organizations"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    industry = Column(String, default="general")
    contract_status = Column(String, default="active")
    code = Column(String, unique=True, nullable=True)  # 企業コード
    region = Column(String, nullable=True)  
    is_company = Column(Boolean, default=True)

    areas = relationship("Area", secondary=organization_areas, back_populates="organizations")
    users = relationship("User", back_populates="org")
    reports = relationship("Report", back_populates="org")

    incoming_links = relationship("OrgLink", foreign_keys="[OrgLink.to_org_id]", back_populates="to_org")
    outgoing_links = relationship("OrgLink", foreign_keys="[OrgLink.from_org_id]", back_populates="from_org")

    @property
    def linked_orgs(self):
        incoming = [l.from_org for l in self.incoming_links if l.status == "approved"]
        outgoing = [l.to_org for l in self.outgoing_links if l.status == "approved"]
        return incoming + outgoing

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, nullable=False)
    password = Column(String, nullable=False)
    role = Column(String, default="reporter")
    is_admin = Column(Boolean, default=False)
    is_blocked = Column(Boolean, default=False)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)

    paypay_id = Column(String, nullable=True)
    name = Column(String, nullable=True)
    department = Column(String, nullable=True)
    memo = Column(String, nullable=True)
    paypay_status = Column(String, default="unsent")

    org = relationship("Organization", back_populates="users")
    reports = relationship("Report", back_populates="user")
    pay_history = relationship("PayHistory", back_populates="user")

class Report(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    description = Column(String, nullable=True)
    category = Column(String, default="general")
    status = Column(String, default="new")
    image_path = Column(String, nullable=True)
    address = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user_id = Column(Integer, ForeignKey("users.id"))
    org_id = Column(Integer, ForeignKey("organizations.id"))

    user = relationship("User", back_populates="reports")
    org = relationship("Organization", back_populates="reports")

class OrgLink(Base):
    __tablename__ = "org_links"
    id = Column(Integer, primary_key=True)
    from_org_id = Column(Integer, ForeignKey("organizations.id"))
    to_org_id = Column(Integer, ForeignKey("organizations.id"))
    status = Column(String, default="pending")  # pending, approved, rejected

    from_org = relationship("Organization", foreign_keys=[from_org_id], back_populates="outgoing_links")
    to_org = relationship("Organization", foreign_keys=[to_org_id], back_populates="incoming_links")

class PayHistory(Base):
    __tablename__ = "pay_history"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    amount = Column(Integer, nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="pay_history")

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True)
    report_id = Column(Integer, ForeignKey("reports.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    content = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    report = relationship("Report", backref="messages")
    user = relationship("User")

    def to_dict(self):
        return {
            "id": self.id,
            "report_id": self.report_id,
            "user_id": self.user_id,
            "content": self.content,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

def get_user_by_id(db: Session, user_id: int):
    return db.query(User).filter(User.id == user_id).first()
