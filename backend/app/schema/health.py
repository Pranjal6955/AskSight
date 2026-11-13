from typing import Literal

from pydantic import BaseModel

# `checks` maps a subsystem to its state; only "database" is probed today.
HealthState = Literal["ok", "unavailable"]


class LiveResponse(BaseModel):
    status: Literal["ok"] = "ok"


class ReadyResponse(BaseModel):
    status: HealthState
    checks: dict[str, HealthState]
