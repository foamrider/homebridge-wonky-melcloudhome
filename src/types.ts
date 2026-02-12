type PollingConfig = {
  pollingIntervalSeconds: number;
};

export type MelCloudHomeConfig = {
  email: string;
  password: string;
  polling: PollingConfig;
  enableFan: boolean;
  enableSwing: boolean;
  enableStandby: boolean;
  enableDhw: boolean;
};

export type UnitType = "ata" | "atw";

export type AtaCapabilities = {
  minTempHeat: number;
  maxTempHeat: number;
  minTempCoolDry: number;
  maxTempCoolDry: number;
  minTempAutomatic: number;
  maxTempAutomatic: number;
  hasHalfDegreeIncrements: boolean;
  hasAutomaticFanSpeed: boolean;
  numberOfFanSpeeds: number;
  hasSwing: boolean;
  hasStandby: boolean;
  hasCoolOperationMode: boolean;
  hasHeatOperationMode: boolean;
  hasAutoOperationMode: boolean;
  hasDryOperationMode: boolean;
};

export type AtwCapabilities = {
  hasHotWater: boolean;
  hasCoolingMode: boolean;
  hasHalfDegrees: boolean;
  hasZone2: boolean;
  hasStandby: boolean;
};

type BaseUnit = {
  id: string;
  name: string;
  type: UnitType;
  power: boolean;
};

export type AtaUnit = BaseUnit & {
  type: "ata";
  operationMode: string;
  setTemperature: number | null;
  roomTemperature: number | null;
  setFanSpeed: string | null;
  vaneVerticalDirection: string | null;
  inStandbyMode: boolean;
  capabilities: AtaCapabilities;
};

export type AtwUnit = BaseUnit & {
  type: "atw";
  operationModeZone1: string;
  operationStatus: string;
  setTemperatureZone1: number | null;
  roomTemperatureZone1: number | null;
  setTankWaterTemperature: number | null;
  tankWaterTemperature: number | null;
  forcedHotWaterMode: boolean;
  inStandbyMode: boolean;
  capabilities: AtwCapabilities;
};

export type MelCloudUnit = AtaUnit | AtwUnit;
