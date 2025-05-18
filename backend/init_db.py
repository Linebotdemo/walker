from dotenv import load_dotenv
load_dotenv()

from backend.models import Base
from backend.database import engine

Base.metadata.create_all(bind=engine)
print("✅ DBテーブル作成完了")
