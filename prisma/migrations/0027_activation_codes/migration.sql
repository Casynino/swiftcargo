-- One-time activation / password-reset codes for customer portal logins.
-- Additive: one new table, nothing existing is changed.
CREATE TABLE "ActivationCode" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "issuedById" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivationCode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ActivationCode_customerId_purpose_createdAt_idx" ON "ActivationCode"("customerId", "purpose", "createdAt");
ALTER TABLE "ActivationCode" ADD CONSTRAINT "ActivationCode_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivationCode" ADD CONSTRAINT "ActivationCode_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
