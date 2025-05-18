from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from typing import Dict, List
from jose import jwt, JWTError
from config import SECRET_KEY, ALGORITHM
from database import get_db
from models import User
from sqlalchemy.orm import Session
import traceback

router = APIRouter()

class WebSocketManager:
    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, chat_id: int, websocket: WebSocket, user_id: int):
        await websocket.accept()
        if chat_id not in self.active_connections:
            self.active_connections[chat_id] = []
        self.active_connections[chat_id].append(websocket)
        print(f"🟢 接続: chat_id={chat_id}, user_id={user_id}")

    async def disconnect(self, chat_id: int, websocket: WebSocket):
        if chat_id in self.active_connections:
            try:
                self.active_connections[chat_id].remove(websocket)
                print(f"🔴 切断: chat_id={chat_id}")
            except ValueError:
                pass  # すでに削除されていた場合

    async def broadcast(self, chat_id: int, message: dict):
        if chat_id in self.active_connections:
            for connection in list(self.active_connections[chat_id]):
                try:
                    await connection.send_json(message)
                except Exception as e:
                    print(f"⚠️ broadcast失敗: {e}")
                    await self.disconnect(chat_id, connection)

manager = WebSocketManager()

def verify_token(token: str, db: Session) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
    except (JWTError, ValueError):
        raise Exception("Invalid token")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise Exception("User not found")
    return user

@router.websocket("/ws/chats/{chat_id}")
async def websocket_chat(
    websocket: WebSocket,
    chat_id: int,
    token: str = Query(...),
    db: Session = Depends(get_db)
):
    try:
        user = verify_token(token, db)
        print(f"✅ JWT解析成功: user_id={user.id}")
        await manager.connect(chat_id, websocket, user.id)
        print(f"🟢 WebSocket接続成功: chat_id={chat_id}, user_id={user.id}")

        while True:
            try:
                print("🟡 メッセージ待機中...")
                data = await websocket.receive_json()
                print(f"🟢 メッセージ受信: {data}")

                message = {
                    "id": data.get("id"),
                    "text": data.get("text"),
                    "image": data.get("image"),
                    "sender_id": user.id,
                    "created_at": data.get("created_at"),
                }
                await manager.broadcast(chat_id, message)

            except WebSocketDisconnect as e:
                print(f"🔌 WebSocket切断: chat_id={chat_id}, user_id={user.id}")
                break

            except Exception as e:
                print(f"⚠️ WebSocket受信エラー: {e}")
                traceback.print_exc()
                await websocket.send_json({"error": "Invalid message format"})
                continue

    except Exception as e:
        print(f"❌ WebSocket初期化エラー: {e}")
        traceback.print_exc()
        await websocket.close(code=1011)

    finally:
        await manager.disconnect(chat_id, websocket)
