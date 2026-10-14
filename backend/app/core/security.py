from pwdlib import PasswordHash
import os
import jwt
from datetime import datetime, timedelta, timezone

SECRET_KEY = os.getenv("JWT")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

passwordHash = PasswordHash.recommended()

def hash_password(password : str) -> str:
    return passwordHash.hash(password)

def verify_password(plain_password:str, hash_password:str) -> bool:
    return passwordHash.verify(plain_password,hash_password)

def create_access_token(user_id : str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes = ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub" : user_id,
        "exp" : expires_at
    }

    return jwt.encode(payload,SECRET_KEY,algorithm=ALGORITHM)