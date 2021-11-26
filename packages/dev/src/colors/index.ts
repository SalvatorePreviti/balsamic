import { devEnv } from '../dev-env'

import colors from 'chalk'

if ((!colors.supportsColor || !colors.supportsColor.hasBasic) && devEnv.supportsBasicColors()) {
  const env = process.env
  const hasFullColors = env.COLORTERM === 'truecolor'
  const has256colors = hasFullColors || (!!env.TERM && /-256(color)?$/i.test(env.TERM))
  colors.supportsColor = {
    level: has256colors ? 2 : hasFullColors ? 3 : 1,
    hasBasic: true,
    has256: has256colors,
    has16m: hasFullColors
  }
}

export { colors }
