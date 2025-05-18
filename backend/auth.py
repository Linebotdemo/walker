from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from passlib.hash import bcrypt
from pydantic import BaseModel
from backend.database import get_db
from backend.models import User, Organization, Area
from backend.auth_utils import create_token
from backend.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["Auth"])

class SignUpBody(BaseModel):
    email: str
    password: str
    org_name: str | None = None
    industry: str | None = "general"
    region: str | None = None
    name: str | None = None
    department: str | None = None

@router.post("/signup")
def signup(body: SignUpBody, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=body.email,
        password=bcrypt.hash(body.password),
        name=body.name or "",
        department=body.department or "",
        role="user",  # default を一般ユーザーにしておく（企業の場合はあとで上書き）
    )

    if body.org_name:
        org = Organization(name=body.org_name, industry=body.industry or "general")
        if body.region:
            area = db.query(Area).filter(Area.name == body.region).first()
            if not area:
                area = Area(name=body.region)
                db.add(area)
                db.flush()
            org.areas.append(area)
        db.add(org)
        db.flush()
        user.role = "company"
        user.org_id = org.id

    db.add(user)
    db.commit()
    db.refresh(user)
    return {"token": create_token(user)}
