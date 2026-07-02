import { describe, expect, it } from 'vitest'

import { getSugg, resolve } from './heroes'

describe('hero name localization and aliases', () => {
  it('resolves Muerta legacy names and nickname to 琼英碧灵', () => {
    expect(resolve('琼英碧灵')).toBe('琼英碧灵')
    expect(resolve('穆尔塔')).toBe('琼英碧灵')
    expect(resolve('Muerta')).toBe('琼英碧灵')
    expect(resolve('奶绿')).toBe('琼英碧灵')
  })

  it('resolves Largo to the official Chinese name 朗戈', () => {
    expect(resolve('朗戈')).toBe('朗戈')
    expect(resolve('Largo')).toBe('朗戈')
    expect(resolve('拉尔戈')).toBe('朗戈')
    expect(resolve('拉戈')).toBe('朗戈')
  })

  it('suggests canonical localized names from aliases', () => {
    expect(getSugg('奶绿')).toContain('琼英碧灵')
    expect(getSugg('Largo')).toContain('朗戈')
  })
})
