// Enable only after the shared backend migration has been applied.
export const notificationQueueEnabled = import.meta.env.VITE_COUNCIL_NOTIFICATION_OUTBOX !== 'false';
