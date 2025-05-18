from sqlalchemy.orm import Session
from backend.main import SessionLocal, User, Organization
import uuid
import logging

# ロギング設定
logging.basicConfig(level=logging.DEBUG, filename="fix_user_org.log", filemode="a",
                    format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

def fix_user_org_by_id(user_id):
    db = SessionLocal()
    try:
        logger.debug(f"ユーザーID {user_id} を確認中...")
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            logger.error(f"ユーザーID {user_id} が見つかりません")
            print(f"エラー: ユーザーID {user_id} が見つかりません")
            return False
        if user.org_id:
            logger.info(f"ユーザーID {user_id} (email: {user.email}) には既に組織が割り当てられています: org_id={user.org_id}")
            print(f"ユーザーID {user_id} (email: {user.email}) には既に組織が割り当てられています: org_id={user.org_id}")
            return True
        org = db.query(Organization).filter(Organization.name == "Default Org").first()
        if not org:
            logger.debug("デフォルト組織を作成中...")
            org = Organization(
                name="Default Org",
                industry="general",
                code=f"C-{uuid.uuid4().hex[:6]}"
            )
            db.add(org)
            db.flush()
            logger.info(f"組織を作成しました: org_id={org.id}")
            print(f"組織を作成しました: org_id={org.id}")
        user.org_id = org.id
        db.commit()
        logger.info(f"ユーザーID {user_id} (email: {user.email}) に org_id {org.id} を割り当てました")
        print(f"ユーザーID {user_id} (email: {user.email}) に org_id {org.id} を割り当てました")
        return True
    except Exception as e:
        logger.error(f"エラー: {str(e)}", exc_info=True)
        print(f"エラー: {str(e)}")
        db.rollback()
        return False
    finally:
        db.close()

if __name__ == "__main__":
    try:
        target_id = input("ユーザーIDを入力してください（例: 2）: ")
        target_id = int(target_id)
        success = fix_user_org_by_id(target_id)
        if success:
            print("修正が完了しました。再度ログインして報告を試してください。")
        else:
            print("修正に失敗しました。fix_user_org.log を確認してください。")
    except ValueError:
        print("エラー: ユーザーIDは数値で入力してください")