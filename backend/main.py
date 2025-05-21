import datetime
from datetime import timezone
import os
import io
import csv
import json
from fastapi import FastAPI
from models import User, Organization, OrgLink
import logging
from fastapi import FastAPI, APIRouter
import requests
from typing import Optional, List
from pathlib import Path
from pydantic import BaseModel
from schemas import ChatMessageCreate

import uuid
import traceback
import shutil
from chat_ws import router as ws_router
from fastapi.staticfiles import StaticFiles
from fastapi.responses    import FileResponse
from dotenv import load_dotenv
from fastapi import HTTPException
from jose import JWTError, jwt
from fastapi import Query
from fastapi.responses import FileResponse
from sqlalchemy import or_
import uuid
from passlib.hash import bcrypt
from fastapi import APIRouter
from fastapi import Body
from fastapi import FastAPI, APIRouter, Depends
from dependencies import get_current_user
from deps import get_current_user
from fastapi import (
    FastAPI, File, UploadFile, Form, HTTPException, Depends,
    status, Query, Request, WebSocket, WebSocketDisconnect,
    APIRouter, Body
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, OAuth2PasswordBearer
from fastapi.responses import JSONResponse
from starlette.responses import StreamingResponse
from starlette.websockets import WebSocketState
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.exceptions import RequestValidationError
from typing import List
from sqlalchemy import (
    create_engine, Column, Integer, String, Float, DateTime, ForeignKey,
    Boolean, Text, func, or_, Table, JSON
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship, Session

import uvicorn

app = FastAPI(title="WalkAudit-GO API")


BASE_DIR = Path(__file__).resolve().parent

# 自作モジュール

from database import get_db
from models import User, ChatMessage, Report, Organization, Area
from schemas import ChatMessageOut, ChatMessageCreate  # schemas.py に定義されているもの
from deps import get_current_active_user, get_current_city_user, verify_token



# Logger setup
logging.basicConfig(
    level=logging.DEBUG,
    filename="backend.log",
    filemode="a",
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)
logger = logging.getLogger("uvicorn.error")
logger.info("Starting FastAPI application")

# Load environment variables
load_dotenv()
SECRET = os.getenv("JWT_SECRET", "your_jwt_secret_here")
DB_URL = os.getenv("DATABASE_URL", "sqlite:///./walkaudit.db")
ALGORITHM = "HS256"
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@example.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "adminpass123")
ACCESS_TOKEN_EXPIRE_MINUTES = 30
from config import SECRET_KEY, ALGORITHM, DATABASE_URL, ADMIN_EMAIL
logger.debug(f"⚙️ 環境変数読み込み: ADMIN_EMAIL={ADMIN_EMAIL!r}, ADMIN_PASSWORD={ADMIN_PASSWORD!r}")


# Database setup
engine = create_engine(DB_URL, connect_args={"check_same_thread": False} if "sqlite" in DB_URL else {})
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()


# OAuth2 scheme for token authentication
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
security = HTTPBearer()




# Database Models
class Area(Base):
    __tablename__ = "areas"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, unique=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    organizations = relationship("Organization", secondary="organization_areas", back_populates="areas")

class Category(Base):
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, unique=True)
    organizations = relationship("Organization", secondary="organization_categories", back_populates="categories")

class Organization(Base):
    __tablename__ = "organizations"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    industry = Column(String, default="general")
    contract_status = Column(String, default="active")
    code = Column(String, nullable=True)
    region = Column(String, nullable=True)
    is_company = Column(Boolean, default=True)
    users = relationship("User", back_populates="org")
    reports = relationship("Report", back_populates="org")
    areas = relationship("Area", secondary="organization_areas", back_populates="organizations")
    categories = relationship("Category", secondary="organization_categories", back_populates="organizations")
    linked_orgs = relationship(
        "Organization",
        secondary="org_links",
        primaryjoin="Organization.id==org_links.c.from_org_id",
        secondaryjoin="Organization.id==org_links.c.to_org_id",
        viewonly=True
    )
    chats = relationship("Chat", back_populates="org")
    assignments = relationship("ReportAssignment", back_populates="org")

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    code = Column(String(16), unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=False)
    password = Column(String, nullable=False)
    role = Column(String, default="reporter")
    user_type = Column(String, nullable=True)
    is_admin = Column(Boolean, default=False)
    is_blocked = Column(Boolean, default=False)
    org_id = Column(Integer, ForeignKey("organizations.id"))
    paypay_id = Column(String, nullable=True)
    name = Column(String, nullable=True)
    username = Column(String, nullable=True)
    department = Column(String, nullable=True)
    memo = Column(String, nullable=True)
    paypay_status = Column(String, default="unsent")
    selected_cities = Column(JSON, default=list, nullable=False)
    org = relationship("Organization", back_populates="users")
    reports = relationship("Report", back_populates="user")
    pay_history = relationship("PayHistory", back_populates="user")
    notifications = relationship("Notification", back_populates="user")
    resolved_histories = relationship("ResolvedHistory", back_populates="resolver")
    feedbacks = relationship("Feedback", back_populates="user")
    chat_messages = relationship("ChatMessage", back_populates="sender")

    def verify_password(self, plain_password: str) -> bool:
        return bcrypt.verify(plain_password, self.password)

class Report(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=True)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    description = Column(String, nullable=True)
    category = Column(String, default="general")
    status = Column(String, default="new")
    address = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(timezone.utc))  # 修正
    rating = Column(Float, nullable=True)
    label = Column(String, default="unknown")
    org_id = Column(Integer, ForeignKey("organizations.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    org = relationship("Organization", back_populates="reports")
    user = relationship("User", back_populates="reports")
    images = relationship("Image", back_populates="report", cascade="all, delete-orphan")
    resolved_histories = relationship("ResolvedHistory", back_populates="report")
    chats = relationship("Chat", back_populates="report")
    assignments = relationship("ReportAssignment", back_populates="report")

    def to_geojson(self):
        return {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [self.lng, self.lat],
            },
            "properties": {
                "id": self.id,
                "title": self.title,
                "description": self.description,
                "category": self.category,
                "status": self.status,
                "created_at": self.created_at.isoformat(),
                "address": self.address,
                "image_paths": [img.image_path for img in self.images] if self.images else [],
                "user": {
                    "id": self.user.id,
                    "name": self.user.name
                } if self.user else None
            }
        }

class Image(Base):
    __tablename__ = "images"
    id = Column(Integer, primary_key=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False)
    image_path = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(timezone.utc))  # 修正
    report = relationship("Report", back_populates="images")

class PayHistory(Base):
    __tablename__ = "pay_history"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    amount = Column(Integer, nullable=False)
    timestamp = Column(DateTime, default=lambda: datetime.datetime.now(timezone.utc))  # 修正
    user = relationship("User", back_populates="pay_history")

class Log(Base):
    __tablename__ = "logs"
    id = Column(Integer, primary_key=True)
    action = Column(String, nullable=False)
    timestamp = Column(DateTime, default=lambda: datetime.datetime.now(timezone.utc))  # 修正
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    user = relationship("User")

class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    user = relationship("User", back_populates="notifications")

class ResolvedHistory(Base):
    __tablename__ = "resolved_history"
    id = Column(Integer, primary_key=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False)
    resolved_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    resolved_at = Column(DateTime, server_default=func.now())
    report = relationship("Report", back_populates="resolved_histories")
    resolver = relationship("User", back_populates="resolved_histories")

class Feedback(Base):
    __tablename__ = "feedback"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    rating = Column(Integer, nullable=False)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    user = relationship("User", back_populates="feedbacks")

class Chat(Base):
    __tablename__ = "chats"
    id = Column(Integer, primary_key=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(timezone.utc))  # 修正
    report = relationship("Report", back_populates="chats")
    org = relationship("Organization", back_populates="chats")
    messages = relationship("ChatMessage", back_populates="chat", cascade="all, delete-orphan")

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True)
    chat_id = Column(Integer, ForeignKey("chats.id"), nullable=False)
    report_id = Column(Integer, ForeignKey("reports.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    text = Column(Text, nullable=True)
    image = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(timezone.utc))  # 修正
    report = relationship("Report")
    sender = relationship("User", back_populates="chat_messages")
    chat = relationship("Chat", back_populates="messages")

    def to_dict(self):
        return {
            "id": self.id,
            "report_id": self.report_id,
            "user_id": self.user_id,
            "text": self.text,
            "image": self.image,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

class ReportAssignment(Base):
    __tablename__ = "report_assignments"
    id = Column(Integer, primary_key=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String, default="assigned")
    assigned_at = Column(DateTime, default=lambda: datetime.datetime.now(timezone.utc))  # 修正
    completed_at = Column(DateTime, nullable=True)
    report = relationship("Report", back_populates="assignments")
    org = relationship("Organization", back_populates="assignments")
    assigner = relationship("User")

class OrgLink(Base):
    __tablename__ = "org_links"
    id = Column(Integer, primary_key=True)
    from_org_id = Column( Integer, ForeignKey("organizations.id"), nullable=False)
    to_org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    status = Column(String, default="pending")
    from_org = relationship("Organization", foreign_keys=[from_org_id])
    to_org = relationship("Organization", foreign_keys=[to_org_id])

# Association tables
organization_areas = Table(
    "organization_areas",
    Base.metadata,
    Column("organization_id", Integer, ForeignKey("organizations.id")),
    Column("area_id", Integer, ForeignKey("areas.id"))
)

organization_categories = Table(
    "organization_categories",
    Base.metadata,
    Column("organization_id", Integer, ForeignKey("organizations.id")),
    Column("category_id", Integer, ForeignKey("categories.id"))
)

# Create database tables
Base.metadata.create_all(bind=engine)
logger.info("Database tables created")

# Pydantic Models
class AreaCreate(BaseModel):
    name: str

class AreaOut(BaseModel):
    id: int
    name: str
    class Config:
         from_attributes = True

class CompanyOut(BaseModel):
    id: int
    name: str
    industry: Optional[str]
    region: Optional[str]
    user_count: Optional[int]
    contract_status: Optional[str]
    class Config:
        from_attributes = True

class ChatMessageOut(BaseModel):
    id: int
    text: Optional[str]
    image: Optional[str]
    report_id: int
    user_id: int
    chat_id: int  # 追加
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class GeneralSignUp(BaseModel):
    email: str
    password: str
    name: Optional[str] = None
    department: Optional[str] = None
    org_name: Optional[str] = None
    industry: Optional[str] = None
    is_admin: Optional[bool] = False
    role: Optional[str] = "reporter"
    class Config:
        extra = "allow"


class MessageOut(BaseModel):
    id: int
    report_id: int
    user_id: int
    content: str
    created_at: datetime.datetime

    model_config = {
        "from_attributes": True,
        "arbitrary_types_allowed": True
    }



class CitySignUp(BaseModel):
    email: str
    password: str
    name: Optional[str] = None
    department: Optional[str] = None

class SignUp(BaseModel):
    email: str
    password: str
    org_name: str
    industry: str = "general"
    areas: list[str] = []
    name: Optional[str] = None
    department: Optional[str] = None

class Login(BaseModel):
    email: str
    password: str

class ReportCreate(BaseModel):
    lat: float
    lng: float
    title: Optional[str]
    description: Optional[str] = None
    category: str
    address: Optional[str] = None

class AdminUserResponse(BaseModel):
    id: int
    name: Optional[str]
    email: str
    username: str
    user_type: str
    org: str
    company_name: str
    department: Optional[str]
    post_count: int
    rating: Optional[float]
    paypay_id: Optional[str]
    paypay_status: str
    is_blocked: bool
    memo: Optional[str]
    class Config:
        from_attributes = True

class AdminCreateUser(BaseModel):
    email: str
    password: str
    user_type: str
    org_id: Optional[int] = None
    name: Optional[str] = None
    department: Optional[str] = None

class CompanyResponse(BaseModel):
    id: int
    name: str
    industry: str
    region: Optional[str]
    code: Optional[str]
    user_count: int
    contract_status: str
    class Config:
        from_attributes = True

class UserResponse(BaseModel):
    id: int
    name: Optional[str]
    username: str
    email: str
    user_type: str
    org: str
    paypay_id: Optional[str]
    post_count: int
    resolved_count: int
    avg_rating: Optional[float]
    paid: bool
    blocked: bool
    class Config:
        from_attributes = True

class OrganizationResponse(BaseModel):
    id: int
    name: str
    type: str
    class Config:
        from_attributes = True

class ReportResponse(BaseModel):
    id: int
    lat: float
    lng: float
    description: Optional[str]
    category: str
    status: str
    address: Optional[str]
    created_at: datetime.datetime
    rating: Optional[float]
    label: str
    user_id: int
    org_id: int
    image_paths: Optional[List[str]] = []
    class Config:
        from_attributes = True



class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, chat_id: int, websocket: WebSocket, user_id: int):
        await websocket.accept()
        self.active_connections.setdefault(chat_id, []).append(websocket)
        logger.info(f"✅ WebSocket接続: chat_id={chat_id}, user_id={user_id}")

    def disconnect(self, chat_id: int, websocket: WebSocket):
        connections = self.active_connections.get(chat_id)
        if connections and websocket in connections:
            connections.remove(websocket)
            logger.info(f"👋 WebSocket切断: chat_id={chat_id}")
            if not connections:
                del self.active_connections[chat_id]

    async def broadcast(self, chat_id: int, message: dict):
        for connection in self.active_connections.get(chat_id, []):
            await connection.send_json(message)

manager = ConnectionManager()
class ReportAssignmentMultiCreate(BaseModel):
    company_ids: List[int]
    attachments: List[str] = []


class OrganizationCreate(BaseModel):
    name: str
    type: str

class CategoryUpdate(BaseModel):
    categories: List[str]

class AreaUpdate(BaseModel):
    areas: List[str]

class ChatCreate(BaseModel):
    reportId: int

class ChatMessageCreate(BaseModel):
    message: str

class ReportAssignmentResponse(BaseModel):
    id: int
    report_id: int
    org_id: int
    status: str
    assigned_at: datetime.datetime
    completed_at: Optional[datetime.datetime]
    report: dict
    class Config:
        from_attributes = True

class ReportAssignmentCreate(BaseModel):
    org_id: int

# Dependency Functions
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def create_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "is_admin": user.is_admin,
        "role": user.role,
        "org": user.org.code if user.org else None,
        "userCode": user.code,
        "exp": datetime.datetime.now(timezone.utc) + datetime.timedelta(days=7)
    }
    token = jwt.encode(payload, SECRET, algorithm=ALGORITHM)
    logger.debug(f"Created JWT for user {user.id}")
    return token

def create_access_token(data: dict, expires_delta: datetime.timedelta):
    to_encode = data.copy()
    expire = datetime.datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            logger.error("Invalid token: No user_id in payload")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            logger.error(f"User not found for ID: {user_id}")
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        if user.is_blocked:
            logger.warning(f"User {user.id} is blocked")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is blocked")
        logger.debug(f"Current user: {user.email}")
        return user
    except JWTError as e:
        logger.error(f"JWT decode error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except Exception as e:
        logger.error(f"Unexpected error in get_current_user: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error")

def admin_required(user: User = Depends(get_current_user)):
    if not user.is_admin and user.user_type != "admin":
        logger.error(f"User {user.id} is not an admin")
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

def city_required(
    token: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    try:
        # JWT を解析
        payload = jwt.decode(token.credentials, SECRET, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")

        # User を取得
        user = db.get(User, int(user_id))
        if not user or not user.org_id:
            raise HTTPException(status_code=403, detail="City access denied")

        # Organization を取得
        org = db.get(Organization, user.org_id)
        if not org or org.is_company:
            raise HTTPException(status_code=403, detail="Not a city organization")

        return user

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except HTTPException:
        raise
    except Exception:
        # 万が一の内部エラー
        raise HTTPException(status_code=500, detail="Internal server error")


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        payload = jwt.decode(credentials.credentials, SECRET, algorithms=[ALGORITHM])
        if not payload.get("org"):
            raise HTTPException(status_code=403, detail="Token missing organization info")
        return {
            "sub": int(payload.get("sub")),
            "role": payload.get("role"),
            "org": payload.get("org")  # ← code でOK
        }
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")



# FastAPI instance
logger.info("FastAPI instance initialized")

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://walkerpost.onrender.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
logger.info("CORS middleware configured")

# Routers
city_router = APIRouter(
    prefix="/api/city",
    dependencies=[Depends(city_required)],   # ← ここを city_required に変更
    tags=["city"]
)
admin_router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(get_current_user)])
company_router = APIRouter(prefix="/api/company", tags=["company"])
router = company_router
auth_router = APIRouter(prefix="/auth", tags=["auth"])

@auth_router.post("/signup", summary="ユーザー登録")
def signup(p: SignUp, db: Session = Depends(get_db)):
    # 既存の /auth/signup 処理をまるごとコピー
    logger.debug(f"Signup attempt for email: {p.email}")
    if get_user_by_email(p.email, db):
        raise HTTPException(status_code=400, detail="Email already registered")
    org = Organization(
        name=p.org_name,
        industry=p.industry or "general",
        code=f"C-{uuid.uuid4().hex[:6]}",
        region=p.areas[0] if p.areas else None
    )
    db.add(org); db.flush()
    for area_name in p.areas:
        area = db.query(Area).filter(Area.name == area_name).first()
        if not area:
            area = Area(name=area_name)
            db.add(area); db.flush()
        org.areas.append(area)
    user_code = f"U-{uuid.uuid4().hex[:6].upper()}"
    user = User(
        email=p.email,
        password=bcrypt.hash(p.password),
        name=p.name,
        username=p.email.split('@')[0],
        department=p.department,
        is_admin=False,
        user_type="company",
        role="company",
        org_id=org.id,
        code=user_code,
    )
    db.add(user); db.commit()
    return {"token": create_token(user)}

@auth_router.post("/login", summary="ログイン")
async def login(form_data: Login, db: Session = Depends(get_db)):
    # 既存の /auth/login 処理をまるごとコピー
    admin_email = os.getenv("ADMIN_EMAIL"); admin_pass = os.getenv("ADMIN_PASSWORD")
    user = authenticate_user(db, form_data.email, form_data.password)
    if form_data.email == admin_email and form_data.password == admin_pass:
        if not user:
            user = db.query(User).filter(User.email == admin_email).first()
            if not user:
                user = User(
                    code=f"DEBUG-{uuid.uuid4().hex[:6].upper()}",
                    email=admin_email,
                    password=bcrypt.hash(admin_pass),
                    is_admin=True, user_type="admin", name="EnvAdmin"
                )
                db.add(user); db.commit(); db.refresh(user)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return {"token": create_token(user)}

@auth_router.get("/me", summary="認証ユーザー情報取得")
async def get_current_user_info(user: User = Depends(get_current_user)):
    # 既存の /auth/me 処理をまるごとコピー
    user_type = (
        "admin"  if user.is_admin or user.user_type=="admin" else
        "city"   if user.role=="city" or user.user_type=="city" else
        "company" if user.role=="company" or user.user_type=="company" else
        "normal"
    )
    return {
        "id": user.id,
        "username": user.name or user.email,
        "email": user.email,
        "user_type": user_type,
        "org": user.org.code if user.org else None,
        "userCode": user.code,
    }




app.include_router(admin_router,  prefix="/api/admin")
app.include_router(company_router, prefix="/api/company")
app.include_router(city_router,    prefix="/api/city")

build_dir = os.path.join(os.path.dirname(__file__), "frontend", "build")

# 1) static assets (js/css/img)  
app.mount(
    "/static",
    StaticFiles(directory=os.path.join(build_dir, "static")),
    name="static",
)

# 2) SPA entrypoint & fallback  
app.mount(
    "/", 
    StaticFiles(directory=build_dir, html=True),
    name="spa"
)



# 会社用フィルター取得（GET）と保存（POST）
@router.post("/api/company/filter/cities")
def get_company_city_filter(current_user: User = Depends(get_current_user)):
    # DB等から company ごとの filter 設定を取得
    return {"selected_cities": []}  # 仮実装（例）


@router.get("/api/company/reports")
def get_company_reports(
    status: Optional[str] = Query(None),
    areaKeywords: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(Report).filter(Report.company_id == current_user.company_id)

    # 両方パラメータが来ているときは OR
    if status and areaKeywords:
        statuses = status.split(",")
        cities = areaKeywords.split("|")
        q = q.filter(
            or_(
              Report.status.in_(statuses),
              Report.city.in_(cities)
            )
        )
    elif status:
        q = q.filter(Report.status.in_(status.split(",")))
    elif areaKeywords:
        q = q.filter(Report.city.in_(areaKeywords.split("|")))
    # なければ全部

    return q.all()

@router.get("/api/company/filter/cities")
def set_company_city_filter(payload: dict, current_user: User = Depends(get_current_user)):
    selected = payload.get("selected_cities", [])
    # DB等に保存処理
    return {"selected_cities": selected}


@router.get("/filter/cities")
def get_filter_cities(current_user: User = Depends(get_current_user)):
    return {"selected_cities": current_user.selected_cities or []}

@router.get("/api/company/areas")
def get_company_areas(current_user: User = Depends(get_current_user)):
    # 利用可能なエリアを返す（例: 登録済みの地点など）
    return [{"id": 1, "name": "港区"}, {"id": 2, "name": "中央区"}]


@router.post("/filter/cities")
def post_filter_cities(payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cities = payload.get("selected_cities", [])
    current_user.selected_cities = cities
    db.commit()
    return {"selected_cities": cities}





# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.debug(f"Request: {request.method} {request.url}")
    try:
        response = await call_next(request)
        logger.debug(f"Response status: {response.status_code}")
        return response
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
            headers={"Access-Control-Allow-Origin": "http://localhost:5173"}
        )

# Custom error handlers
@app.exception_handler(Exception)
async def log_exception_handler(request: Request, exc: Exception):
    logger.exception(f"🛑 UNHANDLED ERROR\nMETHOD: {request.method}\nURL: {request.url}\nERROR: {repr(exc)}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    logger.error(f"⚠️ HTTP ERROR {exc.status_code} on {request.url} → {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning(f"🔎 Validation error on {request.url} → {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()}
    )



# Utility Functions
def save_upload(file: UploadFile) -> str:
    uploads = Path("static/uploads")
    uploads.mkdir(parents=True, exist_ok=True)
    fname = f"{uuid.uuid4()}{Path(file.filename).suffix}"
    path = uploads / fname
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    logger.debug(f"File saved: {path}")
    return str(path)

def get_user_by_email(email: str, db: Session) -> Optional[User]:
    return db.query(User).filter(User.email == email).first()

def authenticate_user(db: Session, email: str, password: str):
    user = get_user_by_email(email, db)
    if not user or not user.verify_password(password):
        logger.error(f"Invalid credentials for email: {email}")
        return False
    return user

def create_admin_user():
    logger.debug(f"🔧 create_admin_user 呼び出し: ADMIN_EMAIL={ADMIN_EMAIL!r}, ADMIN_PASSWORD={ADMIN_PASSWORD!r}")
    with SessionLocal() as db:
        try:
            # 管理者ユーザーが存在しなければ作成
            if not get_user_by_email(ADMIN_EMAIL, db):
                # Admin Org を取得または作成
                org = db.query(Organization).filter(Organization.name == "Admin Org").first()
                if not org:
                    org = Organization(
                        name="Admin Org",
                        industry="administration",
                        code=f"C-{uuid.uuid4().hex[:6]}"
                    )
                    db.add(org)
                    db.flush()
                # 管理者用のランダム 6 桁コードを生成
                admin_code = f"U-{uuid.uuid4().hex[:6].upper()}"
                # 管理者ユーザーを作成
                admin = User(
                    code=admin_code,
                    email=ADMIN_EMAIL,
                    password=bcrypt.hash(ADMIN_PASSWORD),
                    name="Admin",
                    username="Admin",
                    user_type="admin",
                    is_admin=True,
                    org_id=org.id
                )
                db.add(admin)
                db.commit()
                logger.info(f"Created admin user: {ADMIN_EMAIL} with code {admin_code}")
        except Exception as e:
            logger.error(f"Error creating admin user: {e}")
            db.rollback()


def classify_label(value: str | None) -> str:
    if not value:
        return "company"
    city_values = [
        "road", "sidewalk", "traffic_light", "sign", "streetlight",
        "park", "garbage", "water", "tree"
    ]
    return "city" if value in city_values else "company"

# WebSocket clients
websocket_clients = {}

# Auth Endpoints
@app.post("/auth/signup")
def signup(p: SignUp, db: Session = Depends(get_db)):
    logger.debug(f"Signup attempt for email: {p.email}")
    if get_user_by_email(p.email, db):
        raise HTTPException(status_code=400, detail="Email already registered")
    org = Organization(
        name=p.org_name,
        industry=p.industry or "general",
        code=f"C-{uuid.uuid4().hex[:6]}",
        region=p.areas[0] if p.areas else None
    )
    db.add(org)
    db.flush()
    for area_name in p.areas:
        area = db.query(Area).filter(Area.name == area_name).first()
        if not area:
            area = Area(name=area_name)
            db.add(area)
            db.flush()
        org.areas.append(area)
    # ————— ここから追加 —————
    # 6桁のランダム英数字コードを発行
    # ————— ユーザーコード発行 —————
    user_code = f"U-{uuid.uuid4().hex[:6].upper()}"
    user = User(
        email=p.email,
        password=bcrypt.hash(p.password),
        name=p.name,
        username=p.email.split('@')[0],
        department=p.department,
        is_admin=False,
        user_type="company",
        role="company",
        org_id=org.id,                  # ← カンマを追加
        code=user_code,                 # ← ここに code フィールド
    )
    logger.info(f"Created user {p.email} with code {user_code}")
    db.add(user)
    db.commit()
    logger.info(f"User created: {p.email}, org_id: {org.id}")
    return {"token": create_token(user)}

def get_user_id_from_token(token: str) -> int:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = int(payload.get("sub"))
        if user_id is None:
            raise HTTPException(status_code=401, detail="ユーザーIDが見つかりません")
        return user_id
    except JWTError as e:
        logger.error(f"JWT解析失敗: {e}")
        raise HTTPException(status_code=401, detail="トークンが無効です")

@app.post("/auth/signup-general")
def signup_general(p: GeneralSignUp, db: Session = Depends(get_db)):
    logger.debug(f"General signup attempt for email: {p.email}")
    if get_user_by_email(p.email, db):
        raise HTTPException(status_code=400, detail="Email already registered")
    org = db.query(Organization).filter(Organization.name == "Default Org").first()
    if not org:
        org = Organization(
            name="Default Org",
            industry="general",
            code=f"C-{uuid.uuid4().hex[:6]}",
            is_company=False
        )
        db.add(org)
        db.flush()

    # 6桁ランダムコードを生成して code にセット
    user_code = f"U-{uuid.uuid4().hex[:6].upper()}"
    user = User(
        code=user_code,
        email=p.email,
        password=bcrypt.hash(p.password),
        role=p.role or "reporter",
        user_type=p.role or "reporter",
        is_admin=p.is_admin or False,
        name=p.name,
        username=p.email.split('@')[0],
        department=p.department,
        org_id=org.id
    )
    logger.debug(f"Generated user code for general signup: {user_code!r}")

    db.add(user)
    db.commit()
    logger.info(f"User created: {p.email}, code={user_code}, org_id={org.id}")
    return {"token": create_token(user)}

@router.get("/areas", response_model=List[AreaOut])
def get_company_areas(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return [{"id": 1, "name": "港区"}, {"id": 2, "name": "中央区"}]
@city_router.post("/chats/{report_id}/messages", response_model=ChatMessageOut)
def post_city_chat_message(
    report_id: int,
    data: ChatMessageCreate,
    user: User = Depends(city_required),
    db: Session = Depends(get_db)
):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    # Chatがなければ作成
    chat = db.query(Chat).filter(Chat.report_id == report_id, Chat.org_id == user.org_id).first()
    if not chat:
        chat = Chat(report_id=report_id, org_id=user.org_id)
        db.add(chat)
        db.commit()
        db.refresh(chat)

    try:
        parsed = json.loads(data.message)
        text = parsed.get("text")
        image = parsed.get("image")
    except json.JSONDecodeError:
        text = data.message
        image = None

    message = ChatMessage(
        chat_id=chat.id,
        report_id=report_id,
        user_id=user.id,
        text=text,
        image=image
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


@app.post("/auth/login")
async def login(form_data: Login, db: Session = Depends(get_db)):
    # --- デバッグログ：ENV の管理者情報を出力 ---
    admin_email = os.getenv("ADMIN_EMAIL")
    admin_pass  = os.getenv("ADMIN_PASSWORD")
    logger.debug(f"[DEBUG] ENV ADMIN_EMAIL={admin_email!r}, ADMIN_PASSWORD={admin_pass!r}")

    # 1) 通常の DB 認証
    user = authenticate_user(db, form_data.email, form_data.password)

    # 2) フォールバック：フォーム情報が ENV の管理者情報に一致すれば強制ログイン
    if form_data.email == admin_email and form_data.password == admin_pass:
        logger.debug("[DEBUG] フォームの認証情報が ENV の管理者情報と一致しました")
        if not user:
            # DB に管理者ユーザーがいなければ取得 or 作成
            user = db.query(User).filter(User.email == admin_email).first()
            if not user:
                logger.debug("[DEBUG] DB に管理者ユーザーが見つからないため作成します")
                user = User(
                    code=f"DEBUG-{uuid.uuid4().hex[:6].upper()}",
                    email=admin_email,
                    password=bcrypt.hash(admin_pass),
                    is_admin=True,
                    user_type="admin",
                    name="EnvAdmin",
                )
                db.add(user)
                db.commit()
                db.refresh(user)

    # 3) 認証失敗時は 401 を返却
    if not user:
        logger.debug("[DEBUG] 認証に失敗しました")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    logger.info(f"Login successful: {user.email}")
    return {"token": create_token(user)}





@app.get("/auth/me")
async def get_current_user_info(user: User = Depends(get_current_user), local_kw: Optional[str] = Query(None)):
    logger.debug(f"Fetching user info for user ID: {user.id}")
    user_type = (
        "admin" if user.is_admin or user.user_type == "admin" else
        "city" if user.role == "city" or user.user_type == "city" else
        "company" if user.role == "company" or user.user_type == "company" else
        "normal"
    )
    return {
        "id": user.id,
        "username": user.name or user.email,
        "email": user.email,
        "user_type": user_type,
        "org": user.org.code if user.org else None,
        "userCode": user.code,
    }


# City Router
@city_router.get("/profile")
def get_city_profile(
    db: Session = Depends(get_db),
    user: User = Depends(city_required)
):
    # City 用 Organization を取得
    org = db.get(Organization, user.org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    return {
        "categories": [c.name for c in org.categories],
        "areas":      [a.name for a in org.areas],
    }

@city_router.patch("/profile/areas")
def update_city_areas(data: AreaUpdate, user: User = Depends(city_required), db: Session = Depends(get_db)):
    org = org = db.query(Organization).filter(Organization.id == user.org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    org.areas.clear()
    for area_name in data.areas:
        area = db.query(Area).filter(Area.name == area_name).first()
        if not area:
            area = Area(name=area_name)
            db.add(area)
            db.flush()
        org.areas.append(area)
    db.commit()
    return {"message": "Areas updated"}





@city_router.post("/filter/cities")
def set_filter_cities(
    payload: dict,
    user: User = Depends(city_required),
    db: Session = Depends(get_db)
):
    logger.debug(f"▶️ POST /filter/cities payload={payload} for org_id={user.org_id}")
    cities: List[str] = payload.get("selected_cities", [])
    org = org = db.query(Organization).filter(Organization.id == user.org_id).first()

    org.areas.clear()
    logger.debug("   ⬇ cleared existing areas")

    for name in cities:
        area = db.query(Area).filter(Area.name == name).first()
        if not area:
            area = Area(name=name)
            db.add(area)
            db.flush()
            logger.debug(f"   ✨ created new Area '{name}'")
        org.areas.append(area)
        logger.debug(f"   ➕ appended Area '{area.name}'")

    db.commit()
    db.refresh(org)
    logger.debug(f"   ✔ after commit, org.areas={[a.name for a in org.areas]}")
    return {"message": "selected cities updated"}


@city_router.get("/areas", response_model=List[AreaOut])
def get_city_areas(user: User = Depends(city_required), db: Session = Depends(get_db)):
    org = org = db.query(Organization).filter(Organization.id == user.org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return [{"id": a.id, "name": a.name} for a in org.areas]

@city_router.post("/areas", response_model=AreaOut)
def create_city_area(data: AreaCreate, user: User = Depends(city_required), db: Session = Depends(get_db)):
    area = db.query(Area).filter_by(name=data.name).first()
    if not area:
        area = Area(name=data.name)
        db.add(area)
        db.flush()
    org = org = db.query(Organization).filter(Organization.id == user.org_id).first()
    if area not in org.areas:
        org.areas.append(area)
    db.commit()
    db.refresh(area)
    return area

@city_router.patch("/areas/{area_id}")
def update_area(area_id: int, data: dict, user: User = Depends(city_required), db: Session = Depends(get_db)):
    if "name" not in data:
        raise HTTPException(status_code=400, detail="name is required")
    area = db.query(Area).filter(Area.id == area_id).first()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")
    area.name = data["name"]
    db.commit()
    return {"message": "Area updated"}

@city_router.get("/linked_companies")
def get_linked_companies(
    db: Session = Depends(get_db),
    user: User = Depends(city_required)
):
    """
    この市組織（user.org_id）からリンク済みの企業一覧を返す
    """
    links = (
        db.query(OrgLink)
          .filter(
            OrgLink.from_org_id == user.org_id,
            OrgLink.status == "approved"
          )
          .all()
    )
    return [
        {
          "id": link.to_org.id,
          "name": link.to_org.name,
          "industry": link.to_org.industry,
          "code": link.to_org.code
        }
        for link in links
    ]

@city_router.post("/linked_companies")
def link_company(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(city_required)
):
    """
    フロントから { code: 'C-XXXXXX' または 'U-XXXXXX' } を受け取ってリンクを作成
    """
    code = payload.get("code", "").strip()
    logger.debug(f"🔍 link_company called with code={code!r}, user.org_id={user.org_id}")

    if not code:
        logger.warning("❌ code is empty")
        raise HTTPException(status_code=400, detail="Code is required")

    # ① 組織コードで検索
    org = (
        db.query(Organization)
          .filter(
              Organization.code == code,
              Organization.is_company == True
          )
          .first()
    )
    logger.debug(f"① 組織コード検索 -> org={org!r}")

    # ② 見つからなければユーザーコードでも検索
    if not org:
        usr = db.query(User).filter(User.code == code).first()
        logger.debug(f"② ユーザーコード検索 -> usr={usr!r}")
        if usr and usr.org_id:
            org = (
                db.query(Organization)
                  .filter(
                      Organization.id == usr.org_id,
                      Organization.is_company == True
                  )
                  .first()
            )
            logger.debug(f"③ usr.org_id から取得した org={org!r}")

    if not org:
        logger.error(f"❌ Organization not found for code={code!r}")
        raise HTTPException(status_code=404, detail="Organization not found")

    if org.id == user.org_id:
        logger.warning(f"❌ Cannot link own org (org.id={org.id})")
        raise HTTPException(status_code=400, detail="Cannot link your own organization")

    exists = (
        db.query(OrgLink)
          .filter(
              OrgLink.from_org_id == user.org_id,
              OrgLink.to_org_id   == org.id
          )
          .first()
    )
    logger.debug(f"既存リンク確認 -> exists={exists!r}")
    if exists:
        logger.warning("❌ Already linked")
        raise HTTPException(status_code=400, detail="Already linked")

    link = OrgLink(
        from_org_id = user.org_id,
        to_org_id   = org.id,
        status      = "approved"
    )
    db.add(link)
    db.commit()
    logger.info(f"✅ Linked org_id={org.id} to user_org={user.org_id}")

    return {
        "id":       org.id,
        "name":     org.name,
        "industry": org.industry,
        "code":     org.code
    }


@city_router.delete("/areas/{area_id}")
def delete_area(area_id: int, user: User = Depends(city_required), db: Session = Depends(get_db)):
    area = db.query(Area).filter(Area.id == area_id).first()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")
    db.delete(area)
    db.commit()
    return {"message": "Area deleted"}

@city_router.get("/categories")
def get_city_categories(db: Session = Depends(get_db)):
    categories = db.query(Category).all()
    return [{"id": c.id, "name": c.name} for c in categories]

@city_router.get("/companies")
def get_city_companies(db: Session = Depends(get_db)):
    companies = db.query(Organization).filter(Organization.is_company == True).all()
    return [{"id": c.id, "name": c.name} for c in companies]

@city_router.get("/reports")
def get_city_reports(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1),
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    date_from: Optional[datetime.date] = Query(None),
    date_to: Optional[datetime.date] = Query(None),
    search: Optional[str] = Query(None),
    # ここでフロントが投げている パラメータ名 を受け取る
    areaKeywords: Optional[str] = Query(None, alias="areaKeywords"),
    db: Session = Depends(get_db),
    user: User = Depends(city_required),
):
    query = db.query(Report).filter(Report.label == "city")

    # フロントから渡された selectedCities を優先して絞り込む
    if areaKeywords:
        # "Tokyo|Yokohama|Kawasaki" のように '|' 区切りで来る想定
        kws = areaKeywords.split("|")
        query = query.filter(Report.address.isnot(None))
        conds = [Report.address.ilike(f"%{kw}%") for kw in kws if kw]
        if conds:
            query = query.filter(or_(*conds))
    else:
        # フロントで何も選択されていなければ、絞り込みなし or 既存ロジック
        pass

    # 以下、その他のフィルタ（カテゴリ・ステータス・日付・タイトル検索）を適用
    if category:
        query = query.filter(Report.category == category)
    if status:
        query = query.filter(Report.status == status)
    if date_from:
        query = query.filter(Report.created_at >= datetime.datetime.combine(date_from, datetime.time.min))
    if date_to:
        query = query.filter(Report.created_at <= datetime.datetime.combine(date_to, datetime.time.max))
    if search:
        query = query.filter(or_(
            Report.title.ilike(f"%{search}%"),
            Report.description.ilike(f"%{search}%"),
            Report.address.ilike(f"%{search}%"),
        ))

    total = query.count()
    reports = (
        query.order_by(Report.created_at.desc())
             .offset((page - 1) * limit)
             .limit(limit)
             .all()
    )
    total_pages = (total + limit - 1) // limit
    return {
        "features": [r.to_geojson() for r in reports],
        "total_pages": total_pages,
    }

@city_router.post("/assign")
def assign_report_to_companies(
    payload: ReportAssignmentMultiCreate,
    report_id: int = Query(...),
    user: User = Depends(city_required),
    db: Session = Depends(get_db),
):
    report = db.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.label != "city":
        raise HTTPException(status_code=400, detail="Only city-labeled reports can be assigned")

    assignments = []
    for org_id in payload.company_ids:
        org = db.query(Organization).get(org_id)
        if not org:
            raise HTTPException(status_code=404, detail=f"Organization {org_id} not found")
        assignment = ReportAssignment(
            report_id=report_id,
            org_id=org_id,
            assigned_by=user.id,
            status="assigned",
        )
        db.add(assignment)
        assignments.append(assignment)

    # レポートのステータスを一度だけ更新
    report.status = "shared"

    # 操作ログ
    db.add(Log(
        action=f"Report {report_id} assigned to orgs {payload.company_ids} by city user {user.id}"
    ))

    db.commit()

    return {
        "message": "Report assigned",
        "assignment_ids": [a.id for a in assignments],
    }


@city_router.get("/assignments")
def get_city_assignments(user: User = Depends(city_required), db: Session = Depends(get_db)):
    assignments = db.query(ReportAssignment).filter(ReportAssignment.assigned_by == user.id).all()
    return [
        {
            "id": a.id,
            "report_id": a.report_id,
            "org_id": a.org_id,
            "status": a.status,
            "assigned_at": a.assigned_at.isoformat(),
            "completed_at": a.completed_at.isoformat() if a.completed_at else None,
            "report": a.report.to_geojson()
        } for a in assignments
    ]

@city_router.patch("/reports/{report_id}")
def update_report_status(
    report_id: int,
    status: str = Body(...),
    user: User = Depends(city_required),
    db: Session = Depends(get_db)
):
    report = db.query(Report).filter(Report.id == report_id, Report.org_id == user.org_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    report.status = status
    db.commit()
    return {"message": "Report status updated"}

@city_router.get("/chats/{report_id}/messages")
def get_chat_messages(report_id: int, db: Session = Depends(get_db), user: User = Depends(city_required)):
    messages = db.query(ChatMessage).filter(ChatMessage.report_id == report_id).order_by(ChatMessage.created_at).all()
    return [msg.to_dict() for msg in messages]

@city_router.get("/filter/cities")
def get_filter_cities(
    user: User = Depends(city_required),
    db: Session = Depends(get_db)
):
    org = org = db.query(Organization).filter(Organization.id == user.org_id).first()
    selected = [a.name for a in org.areas]
    logger.debug(f"▶️ GET /filter/cities → org_id={user.org_id}, selected={selected}")
    return {"selected_cities": selected}


@app.post("/api/city/chats/{report_id}/messages", response_model=ChatMessageOut)
async def send_chat_message(
    report_id: int,
    text: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="レポートが見つかりません")

    # org_id の確認
    if not current_user.org_id:
        raise HTTPException(status_code=400, detail="ユーザーに組織が設定されていません")

    # Chatを確認または作成
    chat = db.query(Chat).filter(Chat.report_id == report_id, Chat.org_id == current_user.org_id).first()
    if not chat:
        chat = Chat(report_id=report_id, org_id=current_user.org_id)
        db.add(chat)
        db.commit()
        db.refresh(chat)

    image_url = None
    if file:
        image_path = save_upload(file)  # save_upload を使用
        image_url = f"/{image_path}"

    message = ChatMessage(
        chat_id=chat.id,
        report_id=report_id,
        user_id=current_user.id,
        text=text,
        image=image_url,
        created_at=datetime.datetime.now(timezone.utc),
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message
@company_router.get("/linked_companies")
def get_company_linked_companies(
    db: Session = Depends(get_db),
    user: User  = Depends(get_current_user),
):
    links = (
        db.query(OrgLink)
          .filter(
            OrgLink.from_org_id == user.org_id,
            OrgLink.status      == "approved"
          )
          .all()
    )
    return [
        {
          "id":       link.to_org.id,
          "name":     link.to_org.name,
          "industry": link.to_org.industry,
          "code":     link.to_org.code
        }
        for link in links
    ]


# Admin Router
@admin_router.get("/summary")
def admin_summary(db: Session = Depends(get_db), user: User = Depends(admin_required)):
    total_users = db.query(User).count()
    total_companies = db.query(Organization).count()
    total_reports = db.query(Report).count()
    new_reports = db.query(Report).filter(Report.status == "new").count()
    return {
        "totalUsers": total_users,
        "totalCompanies": total_companies,
        "totalReports": total_reports,
        "newReports": new_reports
    }


@app.get("/api/city/chats/{chat_id}/messages")
def get_chat_messages(
    chat_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.org_id == user.org_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    return [
        {
            "id": msg.id,  # ← 追加
            "text": msg.text,
            "image": msg.image,
            "sender_id": msg.user_id,
            "created_at": msg.created_at.isoformat()
        }
        for msg in chat.messages
    ]


@app.websocket("/ws/chat/{report_id}")
async def websocket_endpoint(websocket: WebSocket, report_id: int, token: str = Query(...), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except JWTError:
        await websocket.close(code=1008)
        return

    user = db.query(User).get(user_id)
    if not user:
        await websocket.close(code=1008)
        return

    chat = db.query(Chat).filter(Chat.report_id == report_id).first()
    if not chat:
        chat = Chat(report_id=report_id, org_id=user.org_id or 0)
        db.add(chat)
        db.commit()
        db.refresh(chat)

    await websocket.accept()

    if chat.id not in websocket_clients:
        websocket_clients[chat.id] = []
    websocket_clients[chat.id].append(websocket)

    try:
        while True:
            text = await websocket.receive_text()

            try:
                content_data = json.loads(text)
                text_content = content_data.get("text")
                image_content = content_data.get("image")
            except json.JSONDecodeError:
                text_content = text
                image_content = None

            msg = ChatMessage(
                chat_id=chat.id,
                user_id=user.id,
                report_id=report_id,
                text=text_content,
                image=image_content
            )
            db.add(msg)
            db.commit()

            for ws in websocket_clients[chat.id]:
                await ws.send_json({
                    "text": text_content,
                    "image": image_content,
                    "sender": user.id,
                    "created_at": msg.created_at.isoformat()
                })

    except WebSocketDisconnect:
        pass
    finally:
        websocket_clients[chat.id].remove(websocket)
        if not websocket_clients[chat.id]:
            del websocket_clients[chat.id]



@admin_router.get("/reports")
def admin_reports(db: Session = Depends(get_db), user: User = Depends(admin_required)):
    rows = (
        db.query(
            Report.id,
            User.name.label("username"),
            Organization.name.label("company_name"),
            Report.category,
            Report.status,
            Report.created_at,
            Report.description,
        )
        .outerjoin(User, Report.user_id == User.id)
        .outerjoin(Organization, Report.org_id == Organization.id)
        .all()
    )
    reports = []
    for r in rows:
        report_dict = dict(r._mapping)
        images = db.query(Image).filter(Image.report_id == r.id).all()
        report_dict["image_paths"] = [img.image_path for img in images]
        reports.append(report_dict)
    return reports

@admin_router.patch("/reports/{report_id}/status")
def update_report_status(report_id: int, body: dict, db: Session = Depends(get_db), user: User = Depends(admin_required)):
    rpt = db.query(Report).get(report_id)
    if not rpt:
        raise HTTPException(404, "Report not found")
    if body.get("status") not in ("new", "resolved"):
        raise HTTPException(400, "Invalid status")
    rpt.status = body["status"]
    db.commit()
    return {"message": "updated"}

@admin_router.get("/users", response_model=List[AdminUserResponse])
def get_admin_users(user: User = Depends(admin_required), db: Session = Depends(get_db)):
    users = db.query(User).outerjoin(Organization).all()
    result = []
    for u in users:
        reports = db.query(Report).filter(Report.user_id == u.id).all()
        post_count = len(reports)
        ratings = [r.rating for r in reports if r.rating is not None]
        avg_rating = sum(ratings) / len(ratings) if ratings else None
        org_name = u.org.name if u.org else "N/A"
        result.append({
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "username": u.username or u.email,
            "user_type": u.user_type or u.role,
            "org": f"C-{org_name}" if org_name != "N/A" else "N/A",
            "company_name": org_name,
            "department": u.department,
            "post_count": post_count,
            "rating": avg_rating,
            "paypay_id": u.paypay_id,
            "paypay_status": u.paypay_status,
            "is_blocked": u.is_blocked,
            "memo": u.memo
        })
    return result

@admin_router.get("/logs")
def get_admin_logs(user: User = Depends(admin_required), db: Session = Depends(get_db)):
    logs = db.query(Log).order_by(Log.timestamp.desc()).all()
    return [{"timestamp": l.timestamp.isoformat(), "action": l.action} for l in logs]

@admin_router.post("/paypay/{user_id}")
async def send_paypay(user_id: int, amount: int, user: User = Depends(admin_required), db: Session = Depends(get_db)):
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    if not target_user.paypay_id:
        raise HTTPException(status_code=400, detail="PayPay ID not set")
    pay_history = PayHistory(user_id=user_id, amount=amount)
    target_user.paypay_status = "sent"
    db.add(pay_history)
    db.add(Log(action=f"PayPay {amount} sent to user {user_id} by {user.id}"))
    db.commit()
    return {"message": "PayPay sent"}

@admin_router.patch("/users/{user_id}/update")
async def update_user(
    user_id: int,
    is_blocked: Optional[bool] = None,
    memo: Optional[str] = None,
    user: User = Depends(admin_required),
    db: Session = Depends(get_db)
):
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    if is_blocked is not None:
        target_user.is_blocked = is_blocked
        db.add(Log(action=f"User {user_id} {'blocked' if is_blocked else 'unblocked'} by {user.id}"))
    if memo is not None:
        target_user.memo = memo
        db.add(Log(action=f"User {user_id} memo updated by {user.id}"))
    db.commit()
    return {"message": "User updated"}

@admin_router.patch("/companies/{company_id}/update")
async def update_company(
    company_id: int,
    contract_status: str = Query(...),
    user: User = Depends(admin_required),
    db: Session = Depends(get_db)
):
    company = db.query(Organization).filter(Organization.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    company.contract_status = contract_status
    db.add(Log(action=f"Company {company_id} contract status set to {contract_status} by {user.id}"))
    db.commit()
    return {"message": "Company updated"}

@admin_router.post("/city/areas")
def update_areas(areas: list[dict], user: User = Depends(admin_required), db: Session = Depends(get_db)):
    db.query(Area).delete()
    for area in areas:
        db.add(Area(name=area["name"], lat=area["lat"], lng=area["lng"]))
    db.commit()
    return {"detail": "Updated"}

@admin_router.get("/organizations", response_model=List[OrganizationResponse])
async def get_organizations(user: User = Depends(admin_required), db: Session = Depends(get_db)):
    organizations = db.query(Organization).all()
    return [{"id": org.id, "name": org.name, "type": org.industry} for org in organizations]

@admin_router.post("/organizations")
async def create_organization(org: OrganizationCreate, user: User = Depends(admin_required), db: Session = Depends(get_db)):
    db_org = Organization(name=org.name, industry=org.type, code=f"C-{uuid.uuid4().hex[:6]}")
    db.add(db_org)
    db.commit()
    db.refresh(db_org)
    return {"message": "Organization created"}

@admin_router.delete("/users/{user_id}")
async def delete_user(user_id: int, user: User = Depends(admin_required), db: Session = Depends(get_db)):
    user_to_delete = db.query(User).filter(User.id == user_id).first()
    if not user_to_delete:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user_to_delete)
    db.commit()
    return {"message": "User deleted"}

@admin_router.delete("/organizations/{org_id}")
async def delete_organization(org_id: int, user: User = Depends(admin_required), db: Session = Depends(get_db)):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    db.delete(org)
    db.commit()
    return {"message": "Organization deleted"}

@admin_router.delete("/reports/{report_id}")
async def delete_report(report_id: int, user: User = Depends(admin_required), db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    db.delete(report)
    db.commit()
    return {"message": "Report deleted"}

@admin_router.post("/users")
def create_user(user: AdminCreateUser, db: Session = Depends(get_db), current_user: User = Depends(admin_required)):
    if get_user_by_email(user.email, db):
        raise HTTPException(status_code=400, detail="Email already registered")
    org = None
    if user.user_type in ["company", "city"]:
        org = db.query(Organization).filter(Organization.id == user.org_id).first()
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")

    # 6桁ランダムコードを生成して code にセット
    user_code = f"U-{uuid.uuid4().hex[:6].upper()}"
    new_user = User(
        code=user_code,
        email=user.email,
        password=bcrypt.hash(user.password),
        role=user.user_type,
        user_type=user.user_type,
        is_admin=user.user_type == "admin",
        name=user.name,
        username=user.email.split("@")[0],
        department=user.department,
        org_id=org.id if org else None,
    )
    logger.debug(f"Generated user code for admin-created user: {user_code!r}")

    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    logger.info(f"Admin created user: {user.email}, code={user_code}, org_id={new_user.org_id}")
    return new_user

# Company Router
@company_router.get("/reports")
async def get_company_reports(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1),
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    areaKeywords: Optional[str] = Query(None),  # ← 追加
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if user.user_type != "company":
        raise HTTPException(status_code=403, detail="Not authorized")

    # 1) 自社投稿
    own = db.query(Report)\
            .filter(Report.org_id == user.org_id, Report.label == "company")\
            .all()

    # 2) 市から共有されたもの
    shared = db.query(Report)\
               .join(ReportAssignment, Report.id == ReportAssignment.report_id)\
               .filter(ReportAssignment.org_id == user.org_id)\
               .all()

    logger.debug(f"own_count={len(own)}, shared_count={len(shared)}")

    # 3) マージ＆重複排除
    reports_map = {r.id: r for r in own}
    for r in shared:
        reports_map[r.id] = r
    merged = list(reports_map.values())

    # 4) 絞り込み
    if category:
        merged = [r for r in merged if r.category == category]
    if status:
        merged = [r for r in merged if r.status == status]
    if search:
        merged = [
            r for r in merged
            if r.description and search.lower() in r.description.lower()
        ]
    if areaKeywords:
        kws = areaKeywords.split("|")
        # address が NULL でないものに絞り
        filtered = []
        for r in merged:
            addr = r.address or ""
            if any(kw.lower() in addr.lower() for kw in kws):
                filtered.append(r)
        merged = filtered

    # 5) ページング
    total = len(merged)
    total_pages = (total + limit - 1) // limit
    start = (page - 1) * limit
    page_reports = merged[start : start + limit]

    # 6) GeoJSON に変換して返却
    features = [r.to_geojson() for r in page_reports]
    return {
        "features": features,
        "total_pages": total_pages
    }

@company_router.post("/integrate")
def integrate_partner(
    data: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    code = data.get("code", "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="Code is required")

    # ① まず組織コードで検索
    org = db.query(Organization).filter(Organization.code == code).first()

    # ② 見つからなければ、ユーザーコードで検索して所属組織を取得
    if not org:
        usr = db.query(User).filter(User.code == code).first()
        if usr and usr.org_id:
            org = db.query(Organization).get(usr.org_id)

    if not org:
        # 組織コード／ユーザーコードどちらでもヒットしなかった
        raise HTTPException(status_code=404, detail="Organization not found")

    # 自組織とは連携できないように
    if user.org_id == org.id:
        raise HTTPException(status_code=400, detail="Cannot integrate with own organization")

    # すでに連携済みかチェック
    my_org = org = db.query(Organization).filter(Organization.id == user.org_id).first()
    if org in my_org.linked_orgs:
        raise HTTPException(status_code=400, detail="Already linked")

    # 連携作成
    link = OrgLink(from_org_id=my_org.id, to_org_id=org.id, status="approved")
    db.add(link)
    db.commit()

    return {
        "id":       org.id,
        "name":     org.name,
        "industry": org.industry,
        "code":     org.code
    }


@company_router.get("/profile")
def get_company_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org = org = db.query(Organization).filter(Organization.id == user.org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {
        "id": org.id,
        "name": org.name,
        "industry": org.industry,
        "region": org.region,
        "code": org.code,
        "categories": [c.name for c in org.categories],
        "areas": [a.name for a in org.areas]
    }

@company_router.patch("/profile/categories")
def update_company_categories(data: CategoryUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org = org = db.query(Organization).filter(Organization.id == user.org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    org.categories.clear()
    for category_name in data.categories:
        if not category_name:
            continue
        category = db.query(Category).filter(Category.name == category_name).first()
        if not category:
            category = Category(name=category_name)
            db.add(category)
            db.flush()
        org.categories.append(category)
    db.commit()
    return {"message": "Categories updated"}

@company_router.patch("/profile/areas")
def update_company_areas(data: AreaUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org = org = db.query(Organization).filter(Organization.id == user.org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    org.areas.clear()
    for area_name in data.areas:
        if not area_name:
            continue
        area = db.query(Area).filter(Area.name == area_name).first()
        if not area:
            area = Area(name=area_name)
            db.add(area)
            db.flush()
        org.areas.append(area)
    db.commit()
    return {"message": "Areas updated"}

@company_router.patch("/profile/password")
def update_company_password(data: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_password = data.get("currentPassword")
    new_password = data.get("newPassword")
    if not current_password or not new_password:
        raise HTTPException(status_code=400, detail="Current and new password required")
    if not user.verify_password(current_password):
        raise HTTPException(status_code=401, detail="Invalid current password")
    user.password = bcrypt.hash(new_password)
    db.commit()
    return {"message": "Password updated"}

@company_router.get("/partners")
def get_company_partners(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org = org = db.query(Organization).filter(Organization.id == user.org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return [
        {
            "id": o.id,
            "name": o.name,
            "industry": o.industry,
            "code": o.code,
        }
        for o in org.linked_orgs
    ]

@company_router.post("/reports/{report_id}/resolve")
def resolve_report(report_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    report = db.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.org_id != user.org_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    report.status = "resolved"
    resolved_history = ResolvedHistory(
        report_id=report_id,
        resolved_by=user.id
    )
    db.add(resolved_history)
    db.commit()
    return {"message": "Report resolved"}

@company_router.post("/chats")
def create_chat(data: ChatCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    report = db.query(Report).get(data.reportId)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.org_id != user.org_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    chat = Chat(
        report_id=data.reportId,
        org_id=user.org_id
    )
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return {"chatId": chat.id}

@company_router.get("/chats")
def get_chat_by_report(reportId: int = Query(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chat = db.query(Chat).filter(Chat.report_id == reportId, Chat.org_id == user.org_id).first()
    if not chat:
        return {"chatId": None}
    return {"chatId": chat.id}

# routers/company.py の中などに追加




@company_router.post("/chats/{chat_id}/messages")
async def send_chat_message(
    chat_id: int,
    data: ChatMessageCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    chat = db.query(Chat).get(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    logger.debug(f"Chat org_id: {chat.org_id}, User org_id: {user.org_id}")
    if chat.org_id != user.org_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    try:
        parsed = json.loads(data.message)
        text = parsed.get("text")
        image = parsed.get("image")
    except json.JSONDecodeError:
        text = data.message
        image = None

    message = ChatMessage(
        chat_id=chat_id,
        user_id=user.id,
        text=text,
        image=image
    )
    db.add(message)
    db.commit()
    db.refresh(message)

    if chat_id in websocket_clients:
        for client in websocket_clients[chat_id]:
            await client.send_json({
                "text": message.text,
                "image": message.image,
                "sender": "me" if message.user_id == user.id else "other",
                "created_at": message.created_at.isoformat()
            })

    return {"message": "Message sent"}


@company_router.get("/chats/{chat_id}/messages")
async def get_chat_messages(
    chat_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    logger.debug(f"🔍 [GET] /api/company/chats/{chat_id}/messages called")
    logger.debug(f"   → current user: id={user.id}, org_id={user.org_id}")

    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        logger.debug(f"❌ Chat not found for id={chat_id}")
        raise HTTPException(status_code=404, detail="Chat not found")
    logger.debug(f"   → chat.org_id={chat.org_id} (type={type(chat.org_id)})")

    # 権限チェック
    if int(chat.org_id) != int(user.org_id):
        logger.debug(f"❌ org_id mismatch: chat.org_id={chat.org_id} vs user.org_id={user.org_id}")
        raise HTTPException(status_code=403, detail="Not authorized")
    logger.debug("✅ org_id match: Access granted")

    messages = (
        db.query(ChatMessage)
          .filter(ChatMessage.chat_id == chat_id)
          .order_by(ChatMessage.created_at.asc())
          .all()
    )
    logger.debug(f"   → found {len(messages)} messages")

    return [
        {
            "id":         m.id,
            "text":       m.text or "",
            "image":      m.image or None,
            "user_id":    m.user_id,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in messages
    ]



@company_router.get("/chats/{report_id}/messages")
async def get_messages(report_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    messages = db.query(ChatMessage) \
                 .filter(ChatMessage.report_id == report_id) \
                 .order_by(ChatMessage.created_at.asc()) \
                 .all()
    result = []
    for m in messages:
        result.append({
            "id": m.id,
            "text": m.text or "",
            "image": m.image or None,
            "sender_id": m.user_id,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        })
    return result


@company_router.get("/users", response_model=List[UserResponse])
def get_company_users(
    month: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if user.role != "admin" and not user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    query = db.query(User).filter(User.org_id == user.org_id)
    if search:
        query = query.filter(
            (User.name.ilike(f"%{search}%")) | (User.email.ilike(f"%{search}%"))
        )
    if month:
        try:
            start_date = datetime.datetime.strptime(month + "-01", "%Y-%m-%d")
            end_date = (start_date + datetime.timedelta(days=31)).replace(day=1)
            query = query.join(Report).filter(
                Report.created_at >= start_date,
                Report.created_at < end_date
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid month format")
    users = query.all()
    result = []
    for u in users:
        reports = db.query(Report).filter(Report.user_id == u.id).all()
        post_count = len(reports)
        resolved_count = len([r for r in reports if r.status == "resolved"])
        ratings = [r.rating for r in reports if r.rating is not None]
        avg_rating = sum(ratings) / len(ratings) if ratings else None
        org_name = u.org.name if u.org else "N/A"
        result.append({
            "id": u.id,
            "name": u.name,
            "username": u.username or u.email,
            "email": u.email,
            "user_type": u.user_type or u.role,
            "org": f"C-{org_name}" if org_name != "N/A" else "N/A",
            "paypay_id": u.paypay_id,
            "post_count": post_count,
            "resolved_count": resolved_count,
            "avg_rating": avg_rating,
            "paid": u.paypay_status == "sent",
            "blocked": u.is_blocked
        })
    return result

@company_router.patch("/users/{user_id}/block")
def toggle_block(user_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role != "admin" and not user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    target_user = db.query(User).filter(User.id == user_id, User.org_id == user.org_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    target_user.is_blocked = not target_user.is_blocked
    db.add(Log(action=f"User {user_id} {'blocked' if target_user.is_blocked else 'unblocked'} by {user.id}"))
    db.commit()
    return {"message": "Block status updated"}

@company_router.patch("/users/{user_id}/pay")
def toggle_pay_status(user_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role != "admin" and not user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    target_user = db.query(User).filter(User.id == user_id, User.org_id == user.org_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    target_user.paypay_status = "sent" if target_user.paypay_status == "unsent" else "unsent"
    db.add(Log(action=f"User {user_id} pay status set to {target_user.paypay_status} by {user.id}"))
    db.commit()
    return {"message": "Pay status updated"}

@company_router.get("/assignments")
def company_assignments(status: Optional[str] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(ReportAssignment).filter(ReportAssignment.org_id == user.org_id)
    if status:
        q = q.filter(ReportAssignment.status == status)
    return [
        {
            "id": a.id,
            "status": a.status,
            "report": a.report.to_geojson()
        } for a in q.all()
    ]

@company_router.patch("/reports/{report_id}")
def update_report_status(
    report_id: int,
    status: str = Body(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    report = db.query(Report).filter(Report.id == report_id, Report.org_id == user.org_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    report.status = status
    db.commit()
    return {"message": "Report status updated"}

# General Endpoints
@app.post("/reports")
async def create_report(
    lat: float = Form(...),
    lng: float = Form(...),
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    category: str = Form(...),
    address: Optional[str] = Form(None),
    files: List[UploadFile] = File([]),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if user.is_blocked:
        raise HTTPException(status_code=403, detail="User is blocked")
    label = classify_label(category)
    matched_area = None
    matched_org_id = None
    if address:
        areas = db.query(Area).all()
        for area in areas:
            if area.name and area.name in address:
                matched_area = area
                break
        if matched_area:
            for org in matched_area.organizations:
                if not org.is_company:
                    matched_org_id = org.id
                    break
    org_id = matched_org_id if label == "city" and matched_org_id else user.org_id
    report = Report(
        lat=lat,
        lng=lng,
        title=title,
        description=description,
        category=category,
        address=address,
        org_id=org_id,
        user_id=user.id,
        label=label
    )
    db.add(report)
    db.flush()
    for file in files:
        image_path = save_upload(file)
        image = Image(report_id=report.id, image_path=image_path)
        db.add(image)
    db.commit()
    db.refresh(report)
    return report.to_geojson()

@city_router.get("/chats")
def get_or_create_chat(report_id: int, user: User = Depends(city_required), db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    # 既存のチャットがあるか確認
    chat = db.query(Chat).filter_by(report_id=report_id, org_id=user.org_id).first()
    if chat:
        return {"chat_id": chat.id}

    # なければ新規作成
    chat = Chat(report_id=report_id, org_id=user.org_id)
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return {"chat_id": chat.id}





@app.get("/reports", response_model=dict)
async def get_reports(
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Report).filter(Report.user_id == user.id)
    if category:
        query = query.filter(Report.category == category)
    if status:
        query = query.filter(Report.status == status)
    reports = query.all()
    return {"features": [r.to_geojson() for r in reports]}

@app.get("/reports/{report_id}", response_model=ReportResponse)
async def get_report(report_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.user_id != user.id and report.org_id != user.org_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    return report




@app.patch("/reports/{report_id}")
async def update_report(
    report_id: int,
    description: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    address: Optional[str] = Form(None),
    files: List[UploadFile] = File([]),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    if description is not None:
        report.description = description
        report.label = classify_label(description)
    if category is not None:
        report.category = category
    if address is not None:
        report.address = address
    for file in files:
        image_path = save_upload(file)
        image = Image(report_id=report.id, image_path=image_path)
        db.add(image)
    db.commit()
    db.refresh(report)
    return report.to_geojson()

@app.delete("/reports/{report_id}")
async def delete_report(report_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.user_id != user.id and not user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    db.delete(report)
    db.commit()
    return {"message": "Report deleted"}

@app.get("/reports/{report_id}/messages")
def get_report_messages(report_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    messages = db.query(ChatMessage).filter(ChatMessage.report_id == report_id).order_by(ChatMessage.created_at).all()
    return [msg.to_dict() for msg in messages]

# Notification Endpoints
@app.get("/notifications")
async def get_notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    notifications = db.query(Notification).filter(Notification.user_id == user.id).order_by(Notification.created_at.desc()).all()
    return [
        {
            "id": n.id,
            "message": n.message,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat()
        } for n in notifications
    ]

@app.patch("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    notification = db.query(Notification).filter(Notification.id == notification_id, Notification.user_id == user.id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    notification.is_read = True
    db.commit()
    return {"message": "Notification marked as read"}

@admin_router.get("/users")
async def get_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return [UserOut.from_orm(u) for u in users]



# Feedback Endpoints
@app.post("/feedback")
async def submit_feedback(
    rating: int = Form(...),
    comment: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not (1 <= rating <= 5):
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    feedback = Feedback(
        user_id=user.id,
        rating=rating,
        comment=comment
    )
    db.add(feedback)
    db.commit()
    return {"message": "Feedback submitted"}

@app.get("/feedback")
async def get_feedback(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    feedbacks = db.query(Feedback).filter(Feedback.user_id == user.id).order_by(Feedback.created_at.desc()).all()
    return [
        {
            "id": f.id,
            "rating": f.rating,
            "comment": f.comment,
            "created_at": f.created_at.isoformat()
        } for f in feedbacks
    ]


@app.get("/debug/uploads")
def list_uploads():
    folder = BASE_DIR / "static" / "uploads"
    if not folder.exists():
        return {"error": "uploads folder not found"}
    return {"files": [f.name for f in folder.iterdir() if f.is_file()]}



# Geocode Endpoints
@app.get("/geocode")
def geocode(query: Optional[str] = None, lat: Optional[float] = None, lon: Optional[float] = None):
    if query:
        url = f"https://map.yahooapis.jp/geocode/V1/geoCoder"
        params = {
            "appid": os.getenv("YAHOO_API_KEY"),
            "query": query,
            "output": "json",
        }
    elif lat is not None and lon is not None:
        url = f"https://map.yahooapis.jp/geoapi/V1/reverseGeoCoder"
        params = {
            "appid": os.getenv("YAHOO_API_KEY"),
            "lat": lat,
            "lon": lon,
            "output": "json",
        }
    else:
        raise HTTPException(status_code=400, detail="Query or lat/lon required")
    res = requests.get(url, params=params)
    if not res.ok:
        raise HTTPException(status_code=res.status_code, detail=res.text)
    return res.json()

@app.get("/geocode/text")
async def geocode_text(query: str = Query(...)):
    YAHOO_API_KEY = os.getenv("YAHOO_API_KEY")
    if not YAHOO_API_KEY:
        raise HTTPException(status_code=500, detail="Yahoo API key not set")
    url = "https://map.yahooapis.jp/geocode/V1/geoCoder"
    params = {
        "appid": YAHOO_API_KEY,
        "query": query,
        "output": "json"
    }
    try:
        res = requests.get(url, params=params)
        res.raise_for_status()
        data = res.json()
        features = data.get("Feature")
        if not features:
            raise HTTPException(status_code=404, detail="Address not found")
        geometry = features[0]["Geometry"]["Coordinates"].split(",")
        return {
            "lat": float(geometry[1]),
            "lng": float(geometry[0]),
            "address": features[0]["Property"].get("Address", "Unknown address")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Geocoding failed: {str(e)}")

# Export Endpoints
@app.get("/export/reports")
async def export_reports(
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    date_from: Optional[datetime.date] = Query(None),
    date_to: Optional[datetime.date] = Query(None),
    search: Optional[str] = Query(None),
    area: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if user.user_type == "city":
        query = db.query(Report).filter(Report.label == "city")
        if user.org_id:
            query = query.filter(Report.org_id == user.org_id)
    else:
        query = db.query(Report).filter(Report.user_id == user.id)
    if category:
        query = query.filter(Report.category == category)
    if status:
        query = query.filter(Report.status == status)
    if date_from:
        query = query.filter(Report.created_at >= datetime.datetime.combine(date_from, datetime.time.min))
    if date_to:
        query = query.filter(Report.created_at <= datetime.datetime.combine(date_to, datetime.time.max))
    if area:
        query = query.filter(Report.address.ilike(f"%{area}%"))
    if search:
        query = query.filter(or_(
            Report.title.ilike(f"%{search}%"),
            Report.description.ilike(f"%{search}%"),
            Report.address.ilike(f"%{search}%"),
        ))
    reports = query.order_by(Report.created_at.desc()).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID", "Title", "Description", "Category", "Status", "Address",
        "Created At", "Rating", "Label", "Latitude", "Longitude", "User ID", "Organization ID"
    ])
    for report in reports:
        writer.writerow([
            report.id,
            report.title,
            report.description,
            report.category,
            report.status,
            report.address,
            report.created_at.isoformat() if report.created_at else "",
            report.rating,
            report.label,
            report.lat,
            report.lng,
            report.user_id,
            report.org_id,
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment;filename=reports.csv"}
    )

# WebSocket for chats
@app.websocket("/ws/chats/{chat_id}")
async def chat_websocket(chat_id: int, websocket: WebSocket, db: Session = Depends(get_db)):
    await websocket.accept()
    token = websocket.query_params.get("token")
    if not token:
        logger.error("❌ WebSocket接続失敗: tokenがありません")
        if websocket.client_state != WebSocketState.DISCONNECTED:
            await websocket.close(code=1008)
        return

    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
        logger.debug(f"✅ JWT解析成功: user_id={user_id}")
    except JWTError as e:
        logger.error(f"❌ JWT解析エラー: {e}")
        if websocket.client_state != WebSocketState.DISCONNECTED:
            await websocket.close(code=1008)
        return

    user = db.query(User).get(user_id)
    if not user:
        logger.error(f"❌ ユーザーID {user_id} が見つかりません")
        if websocket.client_state != WebSocketState.DISCONNECTED:
            await websocket.close(code=1008)
        return

    chat = db.query(Chat).filter(Chat.report_id == chat_id, Chat.org_id == user.org_id).first()
    if not chat:
        logger.info(f"💬 新しいチャット作成: report_id={chat_id}, org_id={user.org_id}")
        chat = Chat(report_id=chat_id, org_id=user.org_id)
        db.add(chat)
        db.commit()
        db.refresh(chat)

    if chat.id not in websocket_clients:
        websocket_clients[chat.id] = []
    websocket_clients[chat.id].append(websocket)
    logger.debug(f"🟢 WebSocket接続成功: chat_id={chat.id}, user_id={user.id}")

    try:
        while True:
            text = await websocket.receive_text()
            logger.debug(f"📩 受信メッセージ: {text}")
            msg = ChatMessage(chat_id=chat.id, user_id=user.id, text=text)
            db.add(msg)
            db.commit()

            dead = []
            for ws in websocket_clients[chat.id]:
                try:
                    await ws.send_json({
                        "text": msg.content,
                        "sender": user.id,
                        "created_at": msg.created_at.isoformat()
                    })
                except Exception as e:
                    logger.warning(f"⚠️ メッセージ送信失敗: {e}")
                    dead.append(ws)

            for ws in dead:
                websocket_clients[chat.id].remove(ws)
            if not websocket_clients[chat.id]:
                del websocket_clients[chat.id]
    except Exception as e:
        logger.error(f"❌ WebSocket受信ループ中エラー: {e}")
    finally:
        if chat.id in websocket_clients and websocket in websocket_clients[chat.id]:
            websocket_clients[chat.id].remove(websocket)
        if websocket.client_state != WebSocketState.DISCONNECTED:
            await websocket.close()
        logger.debug(f"🔌 WebSocket切断: chat_id={chat.id}, user_id={user.id}")


# Startup Event
@app.on_event("startup")
async def startup_event():
    logger.info("Application startup")
    create_admin_user()

# Include Routers

# Main entry point
if __name__ == "__main__":
    logger.info("Starting Uvicorn server")
    uvicorn.run(app, host="0.0.0.0", port=8000)