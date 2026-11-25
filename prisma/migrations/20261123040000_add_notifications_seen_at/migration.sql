-- Notifications unread tracking: items created after this timestamp count
-- as unread. NULL means the user has never opened their notifications, so
-- everything currently visible is unread until the first look.
ALTER TABLE "User" ADD COLUMN "notificationsSeenAt" TIMESTAMP(3);
