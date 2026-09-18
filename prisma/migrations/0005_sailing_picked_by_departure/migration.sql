-- A customer picks a boat, not a week: two sailings can fall in one week, and
-- "the week of the 28th" is not an answer when one leaves on the 28th and the
-- other on the 3rd. The column holds the departure date it was chosen by.
ALTER TABLE "ContainerBooking" RENAME COLUMN "preferredSailingWeek" TO "preferredSailingDate";
