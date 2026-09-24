BEGIN;
-- A newly authorized connection cannot read mail until its owner selects a label.
ALTER TABLE listing_email_connections ALTER COLUMN "labelId" DROP NOT NULL;
COMMIT;
