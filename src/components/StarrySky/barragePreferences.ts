export interface BarragePreferences {
  readonly immersive: boolean
  readonly intimate: boolean
  readonly fill: boolean
}

export const createInitialBarragePreferences = (): BarragePreferences => ({
  immersive: false,
  intimate: false,
  fill: false,
})

export const setBarragePreference = (
  preferences: BarragePreferences,
  key: keyof BarragePreferences,
  enabled: boolean,
): BarragePreferences => ({
  ...preferences,
  [key]: enabled,
})
