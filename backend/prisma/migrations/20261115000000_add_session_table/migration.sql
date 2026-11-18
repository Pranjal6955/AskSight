-- Older deployed databases may have been created before refresh-token
-- sessions were added. Keep this migration safe for fresh databases too,
-- where the initial migration has already created the table and foreign key.
CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'Session_userId_fkey'
          AND conrelid = '"Session"'::regclass
    ) THEN
        ALTER TABLE "Session"
            ADD CONSTRAINT "Session_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;
