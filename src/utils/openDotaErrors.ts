import type { OpenDotaErrorCode } from '../types'

const OPEN_DOTA_ERROR_PREFIX = '[OPEN_DOTA:'
const OPEN_DOTA_ERROR_RE = /\[OPEN_DOTA:([A-Z_]+)\]\s*(.*)$/s

const OPEN_DOTA_ERROR_CODES: readonly OpenDotaErrorCode[] = [
  'PARSE_PENDING',
  'MATCH_NOT_FOUND',
  'RATE_LIMITED',
  'TIMEOUT',
  'ACCOUNT_MISMATCH',
  'ACCOUNT_REQUIRED',
  'INVALID_MATCH_ID',
  'DUPLICATE_MATCH',
  'UNKNOWN',
] as const

export type OpenDotaErrorLike = Error & { code?: OpenDotaErrorCode }

export interface NormalizedOpenDotaError {
  code: OpenDotaErrorCode
  message: string
}

export function isOpenDotaErrorCode(value: unknown): value is OpenDotaErrorCode {
  return typeof value === 'string' && OPEN_DOTA_ERROR_CODES.includes(value as OpenDotaErrorCode)
}

export function createOpenDotaError(code: OpenDotaErrorCode, message: string): OpenDotaErrorLike {
  const error = new Error(`${OPEN_DOTA_ERROR_PREFIX}${code}] ${message}`) as OpenDotaErrorLike
  error.name = 'OpenDotaError'
  error.code = code
  return error
}

function stripElectronInvokePrefix(message: string): string {
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/u, '')
    .replace(/^Error invoking remote method [^:]+:\s*/u, '')
    .replace(/^Error:\s*/u, '')
}

export function normalizeOpenDotaError(error: unknown): NormalizedOpenDotaError {
  const maybeCode = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
  const rawMessage = error instanceof Error ? error.message : String(error)
  const match = rawMessage.match(OPEN_DOTA_ERROR_RE)

  if (match && isOpenDotaErrorCode(match[1])) {
    return {
      code: match[1],
      message: stripElectronInvokePrefix(match[2].trim()) || rawMessage,
    }
  }

  if (isOpenDotaErrorCode(maybeCode)) {
    return {
      code: maybeCode,
      message: stripElectronInvokePrefix(rawMessage.replace(OPEN_DOTA_ERROR_RE, '$2').trim()) || rawMessage,
    }
  }

  return {
    code: 'UNKNOWN',
    message: stripElectronInvokePrefix(rawMessage),
  }
}

export function getOpenDotaErrorCode(error: unknown): OpenDotaErrorCode {
  return normalizeOpenDotaError(error).code
}

export function formatOpenDotaErrorMessage(error: unknown): string {
  return normalizeOpenDotaError(error).message
}

export function isOpenDotaParseRequestCandidate(error: unknown): boolean {
  const code = getOpenDotaErrorCode(error)
  return code === 'PARSE_PENDING'
    || code === 'MATCH_NOT_FOUND'
    || code === 'RATE_LIMITED'
    || code === 'TIMEOUT'
}
