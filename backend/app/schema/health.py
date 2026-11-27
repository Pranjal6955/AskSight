from typing import Literal

from pydantic import BaseModel, Field

# `checks` maps a subsystem to its state: "database" and "model" are probed.
HealthState = Literal["ok", "unavailable"]


class LiveResponse(BaseModel):
    status: Literal["ok"] = "ok"


class ReadyResponse(BaseModel):
    status: HealthState
    checks: dict[str, HealthState]


class ModelStatusResponse(BaseModel):
    status: HealthState
    ready: bool
    model_version: str | None = None
    stats: dict = Field(default_factory=dict)
