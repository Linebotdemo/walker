from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# ----------- ユーザー関連 -----------
class UserOut(BaseModel):
    id: int
    username: str
    email: str
    is_active: bool

    class Config:
        from_attributes = True


# ----------- レポート関連 -----------
class ReportOut(BaseModel):
    id: int
    title: str
    description: str
    category: str
    address: str
    lat: float
    lng: float
    status: str
    created_at: datetime
    user_id: int
    org_id: Optional[int]

    class Config:
        from_attributes = True


# ----------- チャットメッセージ（出力） -----------
class ChatMessageOut(BaseModel):
    id: int
    report_id: int
    user_id: int
    content: Optional[str] = None
    image_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ----------- チャットメッセージ（送信用） -----------
class ChatMessageCreate(BaseModel):
    content: Optional[str] = None
    image_url: Optional[str] = None

    class Config:
        from_attributes = True


# ----------- 画像情報（レポートやチャットに添付） -----------
class ImageOut(BaseModel):
    id: int
    url: str
    report_id: Optional[int]
    chat_message_id: Optional[int]

    class Config:
        from_attributes = True
