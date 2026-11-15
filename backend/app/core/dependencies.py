import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError

from app.core.security import ALGORITHM, REFRESH_TOKEN_TYPE, SECRET_KEY
from app.db import db

bearer_schema = HTTPBearer()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer_schema)):
    token = credentials.credentials

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") == REFRESH_TOKEN_TYPE:
            # A refresh token must never work as an access token: it lives 30
            # days instead of 30 minutes.
            raise HTTPException(status_code=401, detail="Invalid token")
        user_id = payload.get("sub")

        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")

    except InvalidTokenError as err:
        raise HTTPException(status_code=401, detail="Invaild or expired token") from err

    user = await db.user.find_unique(where={"id": user_id})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user
