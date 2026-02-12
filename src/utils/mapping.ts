import type { AtaCapabilities, AtwCapabilities } from "../types";

export const ATA_OPERATION_MODES = [
  "Heat",
  "Cool",
  "Automatic",
  "Dry",
  "Fan",
] as const;

export const ATA_FAN_SPEEDS = [
  "Auto",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
] as const;

export const VANE_VERTICAL_DIRECTIONS = [
  "Auto",
  "Swing",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
] as const;

export const VANE_HORIZONTAL_DIRECTIONS = [
  "Auto",
  "Swing",
  "Left",
  "LeftCentre",
  "Centre",
  "RightCentre",
  "Right",
] as const;

const VANE_NUMERIC_TO_WORD: Record<string, string> = {
  "0": "Auto",
  "1": "One",
  "2": "Two",
  "3": "Three",
  "4": "Four",
  "5": "Five",
  "7": "Swing",
};

const FAN_SPEED_NUMERIC_TO_WORD: Record<string, string> = {
  "0": "Auto",
  "1": "One",
  "2": "Two",
  "3": "Three",
  "4": "Four",
  "5": "Five",
};

const VANE_HORIZONTAL_AMERICAN_TO_BRITISH: Record<string, string> = {
  CenterLeft: "LeftCentre",
  Center: "Centre",
  CenterRight: "RightCentre",
};

export const normalizeAtaFanSpeed = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  if ((ATA_FAN_SPEEDS as readonly string[]).includes(value)) {
    return value;
  }
  return FAN_SPEED_NUMERIC_TO_WORD[value] ?? value;
};

export const normalizeAtaVaneVertical = (
  value: string | null,
): string | null => {
  if (!value) {
    return null;
  }
  if ((VANE_VERTICAL_DIRECTIONS as readonly string[]).includes(value)) {
    return value;
  }
  return VANE_NUMERIC_TO_WORD[value] ?? value;
};

export const normalizeAtaVaneHorizontal = (
  value: string | null,
): string | null => {
  if (!value) {
    return null;
  }
  if ((VANE_HORIZONTAL_DIRECTIONS as readonly string[]).includes(value)) {
    return value;
  }
  if (value in VANE_HORIZONTAL_AMERICAN_TO_BRITISH) {
    return VANE_HORIZONTAL_AMERICAN_TO_BRITISH[value];
  }
  return value;
};

export const getAtaTemperatureRange = (
  mode: string,
  capabilities: AtaCapabilities,
): { min: number; max: number } => {
  switch (mode) {
    case "Heat":
      return { min: capabilities.minTempHeat, max: capabilities.maxTempHeat };
    case "Cool":
    case "Dry":
      return {
        min: capabilities.minTempCoolDry,
        max: capabilities.maxTempCoolDry,
      };
    case "Automatic":
    default:
      return {
        min: capabilities.minTempAutomatic,
        max: capabilities.maxTempAutomatic,
      };
  }
};

export const ATA_DEFAULT_CAPABILITIES: AtaCapabilities = {
  minTempHeat: 10,
  maxTempHeat: 31,
  minTempCoolDry: 16,
  maxTempCoolDry: 31,
  minTempAutomatic: 16,
  maxTempAutomatic: 31,
  hasHalfDegreeIncrements: true,
  hasAutomaticFanSpeed: true,
  numberOfFanSpeeds: 5,
  hasSwing: true,
  hasStandby: false,
  hasCoolOperationMode: true,
  hasHeatOperationMode: true,
  hasAutoOperationMode: true,
  hasDryOperationMode: true,
};

export const ATW_DEFAULT_CAPABILITIES: AtwCapabilities = {
  hasHotWater: true,
  hasCoolingMode: false,
  hasHalfDegrees: false,
  hasZone2: false,
  hasStandby: false,
};

export const ATW_HEAT_MODES = [
  "HeatRoomTemperature",
  "HeatFlowTemperature",
  "HeatCurve",
] as const;

export const ATW_COOL_MODES = [
  "CoolRoomTemperature",
  "CoolFlowTemperature",
] as const;
