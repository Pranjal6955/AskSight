from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.db.prisma import prisma


@asynccontextmanager
async def lifespan(app: FastAPI):
    await prisma.connect()
    yield
    if prisma.is_connected():
        await prisma.disconnect()


app = FastAPI(
    title="AskSight Backend",
    version="1.0",
    lifespan=lifespan,
)

@app.get("/health")
async def health():
    return {
        "status": "ok"
    }


