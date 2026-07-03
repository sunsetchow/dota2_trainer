import { describe, expect, it } from 'vitest'

import {
  createOpenDotaError,
  formatOpenDotaErrorMessage,
  getOpenDotaErrorCode,
  isOpenDotaParseRequestCandidate,
  normalizeOpenDotaError,
} from './openDotaErrors'

describe('OpenDota structured errors', () => {
  it('serializes code into the message so IPC callers can recover it', () => {
    const error = createOpenDotaError('PARSE_PENDING', 'OpenDota detailed match data is not ready yet.')

    expect(error.code).toBe('PARSE_PENDING')
    expect(error.message).toBe('[OPEN_DOTA:PARSE_PENDING] OpenDota detailed match data is not ready yet.')
    expect(getOpenDotaErrorCode(error)).toBe('PARSE_PENDING')
    expect(formatOpenDotaErrorMessage(error)).toBe('OpenDota detailed match data is not ready yet.')
  })

  it('recovers code and display message after Electron wraps the error message', () => {
    const wrapped = new Error('Error invoking remote method opendota:importMatch: Error: [OPEN_DOTA:RATE_LIMITED] OpenDota rate limited this request.')

    expect(normalizeOpenDotaError(wrapped)).toEqual({
      code: 'RATE_LIMITED',
      message: 'OpenDota rate limited this request.',
    })
  })

  it('uses structured codes, not localized text, to decide whether parse request should be offered', () => {
    expect(isOpenDotaParseRequestCandidate(createOpenDotaError('PARSE_PENDING', 'any text'))).toBe(true)
    expect(isOpenDotaParseRequestCandidate(createOpenDotaError('MATCH_NOT_FOUND', 'any text'))).toBe(true)
    expect(isOpenDotaParseRequestCandidate(createOpenDotaError('RATE_LIMITED', 'any text'))).toBe(true)
    expect(isOpenDotaParseRequestCandidate(createOpenDotaError('TIMEOUT', 'any text'))).toBe(true)
    expect(isOpenDotaParseRequestCandidate(createOpenDotaError('ACCOUNT_MISMATCH', 'any text'))).toBe(false)
    expect(isOpenDotaParseRequestCandidate(new Error('这是一条包含解析二字但没有 code 的普通错误'))).toBe(false)
  })
})
