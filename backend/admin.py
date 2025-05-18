from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.models import Organization, User, Report, OrgLink, Area
from backend.database import get_db
from backend.deps import get_current_user
from backend.database import get_db
from .deps import get_current_user

router = APIRouter(prefix="/api/admin", tags=["Admin"])


def admin_required(user=Depends(get_current_user)):
    if not user.is_admin:
        raise HTTPException(403, "Admin only")
    return user


@router.get("/summary")
def summary(db: Session = Depends(get_db), _: User = Depends(admin_required)):
    return {
        "totalUsers": db.query(User).count(),
        "totalCompanies": db.query(Organization).count(),
        "totalReports": db.query(Report).count(),
        "newReports": db.query(Report).filter(Report.status == "new").count(),
    }


@router.patch("/companies/{cid}/update")
def update_company(cid: int, contract_status: str, db: Session = Depends(get_db), _: User = Depends(admin_required)):
    org = db.query(Organization).get(cid)
    if not org:
        raise HTTPException(404, "Company not found")
    org.contract_status = contract_status
    db.commit()
    return {"message": "updated"}


@router.get("/companies")
def companies(db: Session = Depends(get_db), _: User = Depends(admin_required)):
    return [
        {
            "id": o.id,
            "name": o.name,
            "industry": o.industry,
            "code": o.code,
            "contract_status": o.contract_status,
            "area_count": len(o.areas),
        }
        for o in db.query(Organization).all()
    ]