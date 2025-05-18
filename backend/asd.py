from sqlalchemy.orm import Session
from models import ChatMessage
from database import SessionLocal
import datetime

def fix_null_created_at():
    db: Session = SessionLocal()
    try:
        # NULL created_at のチャットを探す
        null_msgs = db.query(ChatMessage).filter(ChatMessage.created_at == None).all()
        print(f"NULL created_at 件数: {len(null_msgs)}")
        for msg in null_msgs:
            msg.created_at = datetime.datetime.utcnow()
        db.commit()
        print("修正が完了しました。")
    finally:
        db.close()

# 実行
fix_null_created_at()
