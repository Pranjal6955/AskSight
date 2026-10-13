from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.db import db

@asynccontextmanager
async def lifespan(app : FastAPI):
    # Startup : Connect to DB
    await db.connect()
    yield
    #Shutdown : Disconnected from DB
    await db.disconnect()

app = FastAPI(lifespan=lifespan)

