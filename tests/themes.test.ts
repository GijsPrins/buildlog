import { describe, expect, it } from 'vitest'
import { contrastRatio, validateTheme } from '../app/utils/themes'
import { copyTheme, defaultProjectTheme, projectThemePresets } from '../app/utils/projectEditor'

describe('theme library', () => {
  it('accepts each built-in palette', () => { for (const preset of projectThemePresets) expect(validateTheme(preset.config)).toBeNull() })
  it('copies themes without changing their source', () => { const source = defaultProjectTheme(); const copy = copyTheme(source); copy.colors.primary = '#ffffff'; expect(source.colors.primary).not.toBe(copy.colors.primary) })
  it('rejects invalid or missing colours', () => { const theme = defaultProjectTheme(); theme.colors.primary = 'url(unsafe)'; expect(validateTheme(theme)).not.toBeNull(); delete (theme.colors as Partial<typeof theme.colors>).primary; expect(validateTheme(theme)).not.toBeNull() })
  it('rejects unsupported decorations', () => { const theme = defaultProjectTheme(); theme.decoration.texture = 'external' as typeof theme.decoration.texture; expect(validateTheme(theme)).not.toBeNull() })
  it('calculates text contrast', () => { expect(contrastRatio('#000000','#ffffff')).toBe(21); expect(contrastRatio('#ffffff','#ffffff')).toBe(1) })
})
