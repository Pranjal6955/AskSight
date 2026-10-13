from fastapi import APIRouter,status, HTTPException
from app.schema.auth import SignupRequest, UserResponse
from app.db import db
from app.core.security import hash_password


router = APIRouter(prefix = "/auth",tags=["Authentication"])

@router.post(
        "/signup",
        response_model=UserResponse,
        status_code=status.HTTP_201_CREATED,
)

async def signup(payload:SignupRequest):
    email = str(payload.email).strip().lower()
    existing_user = await db.user.find_unique(
        where={"email":email}
    )

    if existing_user:
        raise HTTPException(
            status_code = status.HTTP_409_CONFLICT,
            detail = "An Account with this email Already exists"
        )

    hashed_password = hash_password(payload.password)

    user = await db.user.create(
            data = {
                "name":payload.name.strip(),
                "email":email,
                "password":hashed_password

            }     
        )

    return UserResponse(
        id = user.id,
        name = user.name,
        email = user.email,
        createdAt = user.createdAt,
    )
