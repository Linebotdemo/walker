from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Report, OrgLink, Organization, Area
from .deps import get_current_user, require_active_contract

router = APIRouter(prefix="/api/company", tags=["Company"])


@router.get("/profile")
def profile(user=Depends(require_active_contract)):
    org = user.org
    return {
        "id": org.id,
        "name": org.name,
        "industry": org.industry,
        "code": org.code,
        "contract_status": org.contract_status,
        "areas": [a.name for a in org.areas],
    }


@router.get("/reports")
def reports(db: Session = Depends(get_db), user=Depends(require_active_contract)):
    qs = (
        db.query(Report)
        .filter(Report.org_id == user.org_id)
        .all()
    )
    return {"features": [r.to_geojson() for r in qs]}


class IntegrateBody(BaseModel):
    code: str = Field(..., description="相手企業コード")


@router.post("/integrate")
def integrate(body: IntegrateBody, db: Session = Depends(get_db), user=Depends(require_active_contract)):
    target = db.query(Organization).filter(Organization.code == body.code).first()
    if not target:
        raise HTTPException(404, "Company not found")
    if target.id == user.org_id:
        raise HTTPException(400, "Cannot integrate with self")

    exists = (
        db.query(OrgLink)
        .filter(OrgLink.from_org_id == user.org_id, OrgLink.to_org_id == target.id)
        .first()
    )
    if exists:
        raise HTTPException(400, "Already requested or linked")

    link = OrgLink(from_org_id=user.org_id, to_org_id=target.id)
    db.add(link)
    db.commit()
    return {"message": "integration request sent", "link_id": link.id}


@router.get("/partners")
def partners(user=Depends(require_active_contract)):
    partners = [l.to_org for l in user.org.outgoing_links if l.status == "approved"] + [
        l.from_org for l in user.org.incoming_links if l.status == "approved"
    ]
    return [
        {"id": o.id, "name": o.name, "industry": o.industry, "code": o.code}
        for o in partners
    ]
