/**
 * Catálogo cerrado de códigos de error (§14.4 del plan).
 * Añadir un error es añadir una entrada aquí; no se inventan strings en el camino.
 * Lo consumen la API (filtro RFC 9457), la web (pintar por campo) e iOS.
 */
export const ERROR_CODES = {
  // Pagaré
  DUE_DATE_BEFORE_ISSUE_DATE: 'due_date_before_issue_date',
  AMOUNT_NOT_POSITIVE: 'amount_not_positive',
  AMOUNT_TOO_LARGE: 'amount_too_large',
  ISSUE_DATE_IN_FUTURE: 'issue_date_in_future',
  INTEREST_RATE_OUT_OF_RANGE: 'interest_rate_out_of_range',
  PLACE_REQUIRED: 'place_required',
  NOTE_NOT_EDITABLE: 'note_not_editable',
  /** No se le emite otro pagaré a quien no ha firmado el anterior (§12, ADR 0019). */
  DEBTOR_HAS_UNSIGNED_NOTE: 'debtor_has_unsigned_note',

  // Firma
  SIGNATURE_EMPTY: 'signature_empty',
  SIGNATURE_TOO_LARGE: 'signature_too_large',
  UNSUPPORTED_FORMAT: 'unsupported_format',
  SIGNATURE_REQUIRED: 'signature_required',
  SIGNATURE_PROCESSING_FAILED: 'signature_processing_failed',

  // Abonos
  PAYMENT_EXCEEDS_BALANCE: 'payment_exceeds_balance',
  PAYMENT_DATE_INVALID: 'payment_date_invalid',
  NOTE_NOT_PAYABLE: 'note_not_payable',
  PAYMENT_ALREADY_VOIDED: 'payment_already_voided',

  // Estado
  INVALID_STATUS_TRANSITION: 'invalid_status_transition',
  NOTE_ALREADY_FINAL: 'note_already_final',
  REASON_REQUIRED: 'reason_required',
  /** Castigo y quita: el folio teclado no coincide (§24.5). */
  WRITTEN_CONFIRMATION_MISMATCH: 'written_confirmation_mismatch',

  // Convenios
  SETTLEMENT_ALREADY_ACTIVE: 'settlement_already_active',
  SETTLEMENT_EXPIRED: 'settlement_expired',
  FORGIVENESS_EXCEEDS_BALANCE: 'forgiveness_exceeds_balance',

  // Folio
  DUPLICATE_FOLIO: 'duplicate_folio',
  SEQUENCE_LOCKED: 'sequence_locked',

  // Autenticación
  INVALID_CREDENTIALS: 'invalid_credentials',
  ACCOUNT_LOCKED: 'account_locked',
  MUST_CHANGE_PASSWORD: 'must_change_password',
  TEMP_PASSWORD_EXPIRED: 'temp_password_expired',
  REFRESH_REUSED: 'refresh_reused',
  TOKEN_EXPIRED: 'token_expired',

  // Contraseña y OTP
  PASSWORD_TOO_WEAK: 'password_too_weak',
  PASSWORD_REUSED: 'password_reused',
  PASSWORD_CHANGE_LIMIT_REACHED: 'password_change_limit_reached',
  OTP_INVALID: 'otp_invalid',
  OTP_EXPIRED: 'otp_expired',
  OTP_ATTEMPTS_EXCEEDED: 'otp_attempts_exceeded',
  OTP_COOLDOWN: 'otp_cooldown',

  // Avisos
  /** Reenviar un aviso ya entregado le mandaría el correo dos veces (§18.1). */
  NOTIFICATION_ALREADY_DELIVERED: 'notification_already_delivered',

  // Genéricos
  NOT_FOUND: 'not_found',
  FORBIDDEN: 'forbidden',
  CONFLICT: 'conflict',
  RATE_LIMITED: 'rate_limited',
  IDEMPOTENCY_CONFLICT: 'idempotency_conflict',
  SERVICE_UNAVAILABLE: 'service_unavailable',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
