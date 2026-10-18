-- WORK AS, AND A TRAIL THAT CANNOT BE REWRITTEN.

ALTER TABLE "DeveloperSession"
  ADD COLUMN "actingAsId" TEXT,
  ADD COLUMN "actingStartedAt" TIMESTAMP(3);

-- Every audit line written by the developer account — including each one
-- written while working as a staff member — is append-only at the database
-- level. An UPDATE or DELETE on such a row raises, so no bug and no careless
-- script can rewrite or erase it. Rows of every other account behave exactly
-- as before.
CREATE OR REPLACE FUNCTION swift_protect_developer_audit() RETURNS trigger AS $fn$
BEGIN
  IF OLD."actorType" = 'DEVELOPER' THEN
    RAISE EXCEPTION 'Developer audit records are append-only (% blocked)', TG_OP;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS swift_protect_developer_audit_trg ON "AuditLog";
CREATE TRIGGER swift_protect_developer_audit_trg
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION swift_protect_developer_audit();
