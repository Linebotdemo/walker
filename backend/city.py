@city_router.get("/chats/{chat_id}/messages")
async def get_chat_messages_for_city(
    chat_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    logger.debug(f"🔍 [CITY] Fetching chat with chat_id={chat_id}")
    chat = db.query(Chat).filter(Chat.id == chat_id).first()

    if not chat:
        logger.debug(f"❌ Chat not found for id={chat_id}")
        raise HTTPException(status_code=404, detail="Chat not found")

    logger.debug(f"🔍 Chat city_id: {chat.city_id} ({type(chat.city_id)}), User city_id: {user.city_id} ({type(user.city_id)})")

    if int(chat.city_id) != int(user.city_id):
        logger.debug(f"❌ city_id mismatch: {chat.city_id} != {user.city_id}")
        raise HTTPException(status_code=403, detail="Not authorized")

    logger.debug("✅ city_id match: Access granted")

    messages = db.query(ChatMessage).filter(ChatMessage.chat_id == chat_id).order_by(ChatMessage.created_at.asc()).all()
    return [
        {
            "text": m.text or "",
            "image": m.image or None,
            "sender_id": m.user_id or 0,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in messages if m is not None
    ]
