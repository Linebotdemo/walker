from sqlalchemy.orm import Session
from typing import Optional
from models import Area, Organization

def find_matching_area(address: str, db: Session) -> Optional[Area]:
    areas = db.query(Area).all()
    for area in areas:
        if area.name and area.name in address:
            return area
    return None

def find_city_org_by_area(area: Area) -> Optional[Organization]:
    for org in area.organizations:
        if not org.is_company:
            return org
    return None
