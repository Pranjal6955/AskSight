from fastapi import APIRouter, Depends, HTTPException, status
from jwt.exceptions import InvalidTokenError

from app.core.dependencies import get_current_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_password,
    verify_password,
)
from app.db import db
from app.schema.auth import (
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    SignupRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

INVALID_SESSION = "Invalid or expired session. Please sign in again."


@router.post(
    "/signup",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def signup(payload: SignupRequest):
    email = str(payload.email).strip().lower()
    existing_user = await db.user.find_unique(where={"email": email})

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="An Account with this email Already exists"
        )

    hashed_password = hash_password(payload.password)

    user = await db.user.create(
        data={"name": payload.name.strip(), "email": email, "password": hashed_password}
    )

    return UserResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        createdAt=user.createdAt,
    )


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest):
    email = str(payload.email).strip().lower()
    user = await db.user.find_unique(where={"email": email})

    if not user or not verify_password(payload.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid email or Password")

    session = await db.session.create(data={"userId": user.id})

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id, session.id),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest):
    try:
        user_id, session_id = decode_refresh_token(payload.refresh_token)
    except InvalidTokenError as err:
        raise HTTPException(status_code=401, detail=INVALID_SESSION) from err

    # The delete count claims the session, so two refreshes racing on the same
    # token cannot both rotate it: exactly one sees a count of 1.
    claimed = await db.session.delete_many(where={"id": session_id, "userId": user_id})
    if claimed == 0:
        raise HTTPException(status_code=401, detail=INVALID_SESSION)

    session = await db.session.create(data={"userId": user_id})

    return TokenResponse(
        access_token=create_access_token(user_id),
        refresh_token=create_refresh_token(user_id, session.id),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: LogoutRequest):
    try:
        user_id, session_id = decode_refresh_token(payload.refresh_token)
    except InvalidTokenError as err:
        raise HTTPException(status_code=401, detail=INVALID_SESSION) from err

    await db.session.delete_many(where={"id": session_id, "userId": user_id})
    # Idempotent: logging out a session that is already gone still succeeds.


@router.get("/me", response_model=UserResponse)
async def get_me(current_user=Depends(get_current_user)):
    return UserResponse(
        id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        createdAt=current_user.createdAt,
    )
