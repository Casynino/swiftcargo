-- The handover, photographed. Multiple shots (the cargo, and the person
-- taking it, if they agree) rather than the single signature file the
-- release form used to accept.
ALTER TABLE "Release" ADD COLUMN "photoUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
