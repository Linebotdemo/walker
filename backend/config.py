# backend/config.py
import os
from dotenv import load_dotenv

# .env ファイルを読み込む
load_dotenv()

# 環境変数から設定値を取得
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./walkaudit.db")
SECRET_KEY = os.getenv("SECRET_KEY", "default_key")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@example.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "adminpass123")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
YAHOO_API_KEY = os.getenv("YAHOO_API_KEY")
