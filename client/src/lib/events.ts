/**
 * Client-side event types that mirror server-side EventTypes
 * This avoids direct imports from server code which can cause
 * compatibility issues with Vite
 */
export enum EventTypes {
  ESIM_STATUS_CHANGE = 'esim_status_change',
  WALLET_BALANCE_UPDATE = 'wallet_balance_update',
  SPENDING_UPDATE = 'spending_update',
  SYSTEM_NOTIFICATION = 'system_notification',
  CONNECTION_STATUS = 'connection_status',
  AUTO_RENEWAL_EVENT = 'auto_renewal_event',
  EXECUTIVE_UPDATE = 'employee_update',
}