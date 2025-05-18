from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from deps import get_db, get_current_user
from models import User

router = APIRouter(prefix="/api/city", tags=["City"])

@router.get("/profile")
def get_city_profile(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # あなたのDBに「areas」という列がある前提（なければあとで微調整）
    return {"areas": current_user.areas.split(",") if current_user.areas else []}
