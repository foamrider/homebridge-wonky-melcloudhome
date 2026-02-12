import type { Logger, PlatformConfig } from "homebridge";

import type { MelCloudHomeConfig } from "./types";

const DEFAULT_POLLING_INTERVAL_SECONDS = 60;

export const parseConfig = (
  log: Logger,
  config: PlatformConfig,
): MelCloudHomeConfig => {
  const email = typeof config.email === "string" ? config.email : "";
  const password = typeof config.password === "string" ? config.password : "";

  if (!email || !password) {
    throw new Error("MELCloud email and password are required.");
  }

  const pollingIntervalSeconds = Number(config.pollingIntervalSeconds);
  const polling = {
    pollingIntervalSeconds: Number.isFinite(pollingIntervalSeconds)
      ? Math.max(30, pollingIntervalSeconds)
      : DEFAULT_POLLING_INTERVAL_SECONDS,
  };

  const enableFan = config.enableFan !== false;
  const enableSwing = config.enableSwing !== false;
  const enableStandby = config.enableStandby === true;
  const enableDhw = config.enableDhw !== false;

  log.debug(
    "Config parsed: polling=%s, fan=%s, swing=%s, standby=%s, dhw=%s",
    JSON.stringify(polling),
    enableFan,
    enableSwing,
    enableStandby,
    enableDhw,
  );

  return {
    email,
    password,
    polling,
    enableFan,
    enableSwing,
    enableStandby,
    enableDhw,
  };
};
