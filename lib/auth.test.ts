/**
 * lib/auth.test.ts — unit tests for the pure credential-verification helpers.
 * These run without a NextAuth server or a live DB: bcryptjs hashes a known
 * secret, and we assert the verify functions accept the right value and reject
 * everything else.
 */
import { describe, it, expect } from 'vitest'
import bcrypt from 'bcryptjs'
import { verifyPassword, verifyPin, isValidPinFormat } from '@/lib/auth'

describe('isValidPinFormat', () => {
  it('accepts exactly four decimal digits', () => {
    expect(isValidPinFormat('0000')).toBe(true)
    expect(isValidPinFormat('1234')).toBe(true)
    expect(isValidPinFormat('9999')).toBe(true)
  })

  it('rejects wrong length or non-digits', () => {
    expect(isValidPinFormat('123')).toBe(false)
    expect(isValidPinFormat('12345')).toBe(false)
    expect(isValidPinFormat('12a4')).toBe(false)
    expect(isValidPinFormat('abcd')).toBe(false)
    expect(isValidPinFormat('')).toBe(false)
    expect(isValidPinFormat(' 123')).toBe(false)
  })
})

describe('verifyPassword', () => {
  it('returns true only for the matching password', async () => {
    const hash = await bcrypt.hash('s3cret-pass', 10)
    expect(await verifyPassword('s3cret-pass', hash)).toBe(true)
    expect(await verifyPassword('wrong-pass', hash)).toBe(false)
  })

  it('returns false for missing password or hash', async () => {
    const hash = await bcrypt.hash('whatever', 10)
    expect(await verifyPassword('', hash)).toBe(false)
    expect(await verifyPassword(undefined, hash)).toBe(false)
    expect(await verifyPassword('whatever', null)).toBe(false)
    expect(await verifyPassword('whatever', undefined)).toBe(false)
  })
})

describe('verifyPin', () => {
  it('returns true only for the matching 4-digit PIN', async () => {
    const hash = await bcrypt.hash('1234', 10)
    expect(await verifyPin('1234', hash)).toBe(true)
    expect(await verifyPin('0000', hash)).toBe(false)
    expect(await verifyPin('4321', hash)).toBe(false)
  })

  it('short-circuits malformed PINs before hitting bcrypt', async () => {
    // Hash of a non-4-digit value: verifyPin must still reject a malformed try.
    const hash = await bcrypt.hash('12', 10)
    expect(await verifyPin('12', hash)).toBe(false) // too short
    expect(await verifyPin('abcd', hash)).toBe(false) // non-numeric
    expect(await verifyPin('12345', hash)).toBe(false) // too long
  })

  it('returns false for missing PIN or hash', async () => {
    const hash = await bcrypt.hash('1234', 10)
    expect(await verifyPin('', hash)).toBe(false)
    expect(await verifyPin(undefined, hash)).toBe(false)
    expect(await verifyPin('1234', null)).toBe(false)
    expect(await verifyPin('1234', undefined)).toBe(false)
  })
})
