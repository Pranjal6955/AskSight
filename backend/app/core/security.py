from pwdlib import PasswordHash

passwordHash = PasswordHash.recommended()

def hash_password(password : str) -> str:
    return passwordHash.hash(password)

def verify_password(plain_password:str, hash_password:str) -> bool:
    return passwordHash.verify(plain_password,hash_password)