"""FastAPI application factory for the AskSight backend."""

from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI  # noqa: E402

from app.api import ask, auth, health, history, images  # noqa: E402
from app.core.middleware import RequestContextMiddleware, setup_logging  # noqa: E402
from app.db import db  # noqa: E402


@asynccontextmanager
async def lifespan(_: FastAPI):
    await db.connect()
    yield
    await db.disconnect()


def create_app() -> FastAPI:
    setup_logging()
    application = FastAPI(
        title="AskSight API",
        description=(
            "Backend for AskSight: image upload, vision-question answering, and history. "
            "All endpoints except /auth/signup, /auth/login and /health/* require a "
            "Bearer access token."
        ),
        version="0.1.0",
        lifespan=lifespan,
    )

    # Outside the router dependencies, so even 401/404 responses carry the id.
    application.add_middleware(RequestContextMiddleware)

    application.include_router(health.router)
    application.include_router(auth.router)
    application.include_router(images.router)
    application.include_router(ask.router)
    application.include_router(history.router)
    return application


app = create_app()
