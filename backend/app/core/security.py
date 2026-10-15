import os
from datetime import UTC, datetime, timedelta

import jwt
from dotenv import load_dotenv
from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError

load_dotenv()

SECRET_KEY = os.getenv("JWT")
if not SECRET_KEY:
    raise RuntimeError("JWT is not set in the environment (.env)")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

passwordHash = PasswordHash.recommended()

def hash_password(password : str) -> str:
    return passwordHash.hash(password)

def verify_password(plain_password:str, hash_password:str) -> bool:
    try:
        return passwordHash.verify(plain_password,hash_password)
    except UnknownHashError:
        return False

def create_access_token(user_id : str) -> str:
    expires_at = datetime.now(UTC) + timedelta(
        minutes = ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub" : user_id,
        "exp" : expires_at
    }

    return jwt.encode(payload,SECRET_KEY,algorithm=ALGORITHM)