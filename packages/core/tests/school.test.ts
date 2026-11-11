import { describe, expect, it } from 'vitest'
import { GERMAN_STATES, levelFromGroupName, schoolForms, schoolLevels, schoolStates, SCHOOL_FORMS } from '../shared/utils/school'

describe('Schulstruktur', () => {
  it('kennt alle 16 Bundesländer mit gültigen Schulformen', () => {
    expect(schoolStates('DE')).toHaveLength(16)
    for (const forms of Object.values(GERMAN_STATES)) for (const form of forms) expect(SCHOOL_FORMS[form]).toBeDefined()
    expect(schoolStates(null)).toEqual([])
  })

  it('liefert Schulformen je Bundesland plus allgemeine', () => {
    const bavaria = schoolForms('DE', 'BY')
    expect(bavaria).toContain('gymnasium9')
    expect(bavaria).toContain('fos')
    expect(bavaria).toContain('other')
    expect(bavaria).not.toContain('stadtteilschule')
  })

  it('leitet Jahrgangsstufen aus der Schulform ab', () => {
    expect(schoolLevels('gymnasium9')).toEqual(['5', '6', '7', '8', '9', '10', '11', '12', '13'])
    expect(schoolLevels('grundschule')).toEqual(['1', '2', '3', '4'])
    expect(schoolLevels('unbekannt')).toEqual([])
  })

  it('rät die Jahrgangsstufe aus dem Klassennamen', () => {
    const levels = schoolLevels('gymnasium9')
    expect(levelFromGroupName('5a', levels)).toBe('5')
    expect(levelFromGroupName('05 b', levels)).toBe('5')
    expect(levelFromGroupName('Klasse 10c', levels)).toBe('10')
    expect(levelFromGroupName('10.2', levels)).toBe('10')
    expect(levelFromGroupName('Informatik-AG', levels)).toBeNull()
    expect(levelFromGroupName('3a', levels)).toBeNull()
    expect(levelFromGroupName('123', levels)).toBeNull()
  })
})
