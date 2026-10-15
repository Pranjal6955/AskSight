from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.db import db
from app.schema.auth import LoginRequest, SignupRequest, UserResponse

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

@router.post("/login")
async def login(payload:LoginRequest):
    email = str(payload.email).strip().lower()
    user = await db.user.find_unique(where={"email":email})

    if not user or not verify_password(
        payload.password, user.password
    ):
        raise HTTPException(status_code = 401, detail = "Invalid email or Password")

    access_token = create_access_token(user.id)

    return {
        "access_token":access_token,
        "token_type":"bearer",
    }

@router.get("/me",response_model=UserResponse)
async def get_me(current_user = Depends(get_current_user)):
    return UserResponse(
        id = current_user.id,
        name = current_user.name,
        email = current_user.email,
        createdAt= current_user.createdAt,
    )