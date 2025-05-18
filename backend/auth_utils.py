import jwt
from datetime import datetime, timedelta
from backend.config import SECRET_KEY, ALGORITHM

def create_token(user):
    expire = datetime.utcnow() + timedelta(days=7)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
        "org_id": user.org_id,
        "is_admin": user.is_admin,
        "exp": expire
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
