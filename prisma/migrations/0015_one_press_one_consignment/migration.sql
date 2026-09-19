-- A receiving form that is submitted twice — a double press, or a retry after
-- a timeout the server had already answered — must not take the same boxes in
-- twice. The key is made when the form opens and travels with it.
ALTER TABLE "Cargo" ADD COLUMN "intakeKey" TEXT;
CREATE UNIQUE INDEX "Cargo_intakeKey_key" ON "Cargo"("intakeKey");
