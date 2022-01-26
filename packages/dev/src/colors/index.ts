import { devEnv } from "../dev-env";

import colors from "chalk";

const n = devEnv.hasColors();
if (n > colors.level) {
  colors.level = n;
}

export { colors };
