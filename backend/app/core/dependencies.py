from fastapi import Depends,HTTPException
from fastapi.security import HTTPBearer,HTTPAuthorizationCredentials
import jwt
from jwt.exceptions import InvalidTokenError
from app.core.security import SECRET_KEY, ALGORITHM
from app.db import db

bearer_schema = HTTPBearer()

async def get_current_user(credentials : HTTPAuthorizationCredentials = Depends(bearer_schema)):
    token = credentials.credentials

    try :
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )
        user_id = payload.get("sub")

        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")

    except InvalidTokenError:
        raise HTTPException(status_code=401,detail = "Invaild or expired token")
    
    user = await db.user.find_unique(where={"id":user_id})
    if not user:
        raise HTTPException(status_code = 401, detail = "User not found")

    return user