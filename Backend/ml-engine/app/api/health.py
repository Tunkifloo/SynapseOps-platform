from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    service: str


@router.get("/health", response_model=HealthResponse, tags=["Observability"])
async def health_check() -> HealthResponse:
    return HealthResponse(status="ok", service="ml-engine")