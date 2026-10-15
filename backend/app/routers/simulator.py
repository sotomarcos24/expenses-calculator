from fastapi import APIRouter

from app.db import DbSession
from app.schemas.simulator import (
    AccumulationRequest,
    AccumulationResponse,
    GoalRequest,
    GoalResponse,
    SimulatorDefaults,
    WithdrawalRequest,
    WithdrawalResponse,
)
from app.security import CurrentUser
from app.services import investments
from app.services import simulator as service

router = APIRouter(prefix="/simulator", tags=["simulator"])


@router.get("/defaults")
def get_defaults(user: CurrentUser, db: DbSession) -> SimulatorDefaults:
    return service.build_defaults(db, user.id, investments.today())


@router.post("/accumulation")
def post_accumulation(user: CurrentUser, body: AccumulationRequest) -> AccumulationResponse:
    return service.run_accumulation(body)


@router.post("/goal")
def post_goal(user: CurrentUser, body: GoalRequest) -> GoalResponse:
    return service.run_goal(body)


@router.post("/withdrawal")
def post_withdrawal(user: CurrentUser, body: WithdrawalRequest) -> WithdrawalResponse:
    return service.run_withdrawal(body)
