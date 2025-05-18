from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from database import get_db
from models import User
from config import SECRET_KEY, ALGORITHM

# ───────────── 認証スキーム ─────────────
security = HTTPBearer()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# ───────────── JWT トークン発行 ─────────────
def create_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "org": user.org_id,
        "is_admin": user.is_admin,
        "exp": datetime.utcnow() + timedelta(days=7),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

# ───────────── トークンのみ検証しペイロード(dict)を返す ─────────────
def verify_token(
    token: str = Depends(oauth2_scheme),
) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="トークンが無効です")

# ───────────── 現在のログインユーザー（User）取得 ─────────────
def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
        user = db.query(User).get(user_id)
        if not user or user.is_blocked:
            raise HTTPException(status_code=403, detail="アクセスが拒否されました")
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="トークンが無効です")

# ───────────── 有効なユーザー取得（ブロックチェック） ─────────────
def get_current_active_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
        user = db.query(User).get(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
        if user.is_blocked:
            raise HTTPException(status_code=403, detail="このユーザーはブロックされています")
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="無効なトークンです")

# ───────────── 市ユーザー限定 ─────────────
def get_current_city_user(user: User = Depends(get_current_user)) -> User:
    if user.role != "city":
        raise HTTPException(status_code=403, detail="市の権限が必要です")
    return user

# ───────────── 契約が有効な企業ユーザー限定 ─────────────
def require_active_contract(user: User = Depends(get_current_user)) -> User:
    if not user.org or user.org.contract_status != "active":
        raise HTTPException(status_code=402, detail="契約が無効です。管理者に連絡してください。")
    return user
