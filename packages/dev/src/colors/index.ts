import { devEnv } from "../dev-env";

import colors from "chalk";

const n = devEnv.hasColors();
if (n > colors.level) {
  colors.level = n;
}

/** An instance of colors that is always disabled. */
const colors_disabled = new colors.Instance({ level: 0 });

export { colors, colors_disabled };
