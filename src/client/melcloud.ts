import type { Logger } from "homebridge";

import { MelCloudAuth } from "./auth";
import type { HttpClient } from "../utils/http";
import type { AtaUnit, AtwUnit, MelCloudUnit } from "../types";
import {
  ATA_DEFAULT_CAPABILITIES,
  ATW_DEFAULT_CAPABILITIES,
  normalizeAtaFanSpeed,
  normalizeAtaVaneVertical,
} from "../utils/mapping";

const BASE_URL = "https://melcloudhome.com";

type UserContext = {
  buildings?: Array<Record<string, unknown>>;
  guestBuildings?: Array<Record<string, unknown>>;
};

type AtaUpdatePayload = {
  power: boolean | null;
  operationMode: string | null;
  setTemperature: number | null;
  setFanSpeed: string | null;
  vaneVerticalDirection: string | null;
  vaneHorizontalDirection: string | null;
  inStandbyMode: boolean | null;
  temperatureIncrementOverride: number | null;
};

type AtwUpdatePayload = {
  power: boolean | null;
  setTankWaterTemperature: number | null;
  forcedHotWaterMode: boolean | null;
  setTemperatureZone1: number | null;
  setTemperatureZone2: number | null;
  operationModeZone1: string | null;
  operationModeZone2: string | null;
  inStandbyMode: boolean | null;
  setHeatFlowTemperatureZone1: number | null;
  setCoolFlowTemperatureZone1: number | null;
  setHeatFlowTemperatureZone2: number | null;
  setCoolFlowTemperatureZone2: number | null;
};

const parseBool = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === null || value === undefined) {
    return false;
  }
  return String(value).toLowerCase() === "true";
};

const parseFloatValue = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseSettings = (settings: unknown): Record<string, string> => {
  if (!Array.isArray(settings)) {
    return {};
  }

  const parsed: Record<string, string> = {};
  for (const entry of settings) {
    if (
      typeof entry === "object" &&
      entry !== null &&
      "name" in entry &&
      "value" in entry
    ) {
      const name = String((entry as { name: unknown }).name);
      const value = (entry as { value: unknown }).value;
      parsed[name] = value === null || value === undefined ? "" : String(value);
    }
  }

  return parsed;
};

export class MelCloudClient {
  private readonly log: Logger;
  private readonly http: HttpClient;
  private readonly auth: MelCloudAuth;

  constructor(log: Logger, http: HttpClient) {
    this.log = log;
    this.http = http;
    this.auth = new MelCloudAuth(log, http);
  }

  async login(email: string, password: string): Promise<void> {
    await this.auth.login(email, password);
  }

  private async getUserContext(): Promise<UserContext> {
    const response = await this.http.request({
      method: "GET",
      url: `${BASE_URL}/api/user/context`,
      headers: {
        Accept: "application/json",
        "x-csrf": "1",
        Referer: `${BASE_URL}/dashboard`,
      },
    });

    if (response.status === 401) {
      throw new Error("Unauthorized");
    }

    return JSON.parse(response.text) as UserContext;
  }

  async setAtaPower(unitId: string, power: boolean): Promise<void> {
    await this.updateAta(unitId, { power });
  }

  async setAtaMode(unitId: string, mode: string): Promise<void> {
    await this.updateAta(unitId, { operationMode: mode });
  }

  async setAtaTemperature(unitId: string, temperature: number): Promise<void> {
    await this.updateAta(unitId, { setTemperature: temperature });
  }

  async setAtaFanSpeed(unitId: string, fanSpeed: string): Promise<void> {
    await this.updateAta(unitId, { setFanSpeed: fanSpeed });
  }

  async setAtaVaneVertical(unitId: string, direction: string): Promise<void> {
    await this.updateAta(unitId, { vaneVerticalDirection: direction });
  }

  async setAtaStandby(unitId: string, standby: boolean): Promise<void> {
    await this.updateAta(unitId, { inStandbyMode: standby });
  }

  async setAtwPower(unitId: string, power: boolean): Promise<void> {
    await this.updateAtw(unitId, { power });
  }

  async setAtwMode(unitId: string, mode: string): Promise<void> {
    await this.updateAtw(unitId, { operationModeZone1: mode });
  }

  async setAtwZoneTemperature(unitId: string, temperature: number): Promise<void> {
    await this.updateAtw(unitId, { setTemperatureZone1: temperature });
  }

  async setAtwTankTemperature(unitId: string, temperature: number): Promise<void> {
    await this.updateAtw(unitId, { setTankWaterTemperature: temperature });
  }

  async setAtwForcedHotWater(unitId: string, enabled: boolean): Promise<void> {
    await this.updateAtw(unitId, { forcedHotWaterMode: enabled });
  }

  async setAtwStandby(unitId: string, standby: boolean): Promise<void> {
    await this.updateAtw(unitId, { inStandbyMode: standby });
  }

  async fetchUnits(): Promise<MelCloudUnit[]> {
    const context = await this.getUserContext();
    const units: MelCloudUnit[] = [];

    const buildings = context.buildings ?? [];
    const guestBuildings = context.guestBuildings ?? [];
    const allBuildings = [...buildings, ...guestBuildings];

    for (const building of allBuildings) {
      const airToAirUnits = Array.isArray(building.airToAirUnits)
        ? building.airToAirUnits
        : [];
      for (const unit of airToAirUnits) {
        units.push(this.mapAtaUnit(unit as Record<string, unknown>));
      }

      const airToWaterUnits = Array.isArray(building.airToWaterUnits)
        ? building.airToWaterUnits
        : [];
      for (const unit of airToWaterUnits) {
        units.push(this.mapAtwUnit(unit as Record<string, unknown>));
      }
    }

    return units;
  }

  private mapAtaUnit(unit: Record<string, unknown>): AtaUnit {
    const settings = parseSettings(unit.settings);
    const rawCapabilities =
      typeof unit.capabilities === "object" && unit.capabilities !== null
        ? (unit.capabilities as Record<string, unknown>)
        : {};
    const mergedCapabilities = {
      ...ATA_DEFAULT_CAPABILITIES,
      minTempHeat: parseFloatValue(rawCapabilities.minTempHeat) ??
        ATA_DEFAULT_CAPABILITIES.minTempHeat,
      maxTempHeat: parseFloatValue(rawCapabilities.maxTempHeat) ??
        ATA_DEFAULT_CAPABILITIES.maxTempHeat,
      minTempCoolDry: parseFloatValue(rawCapabilities.minTempCoolDry) ??
        ATA_DEFAULT_CAPABILITIES.minTempCoolDry,
      maxTempCoolDry: parseFloatValue(rawCapabilities.maxTempCoolDry) ??
        ATA_DEFAULT_CAPABILITIES.maxTempCoolDry,
      minTempAutomatic: parseFloatValue(rawCapabilities.minTempAutomatic) ??
        ATA_DEFAULT_CAPABILITIES.minTempAutomatic,
      maxTempAutomatic: parseFloatValue(rawCapabilities.maxTempAutomatic) ??
        ATA_DEFAULT_CAPABILITIES.maxTempAutomatic,
      hasHalfDegreeIncrements: parseBool(rawCapabilities.hasHalfDegreeIncrements),
      hasAutomaticFanSpeed: parseBool(rawCapabilities.hasAutomaticFanSpeed),
      numberOfFanSpeeds: Number(rawCapabilities.numberOfFanSpeeds ?? 5),
      hasSwing: parseBool(rawCapabilities.hasSwing),
      hasStandby: parseBool(rawCapabilities.hasStandby),
      hasCoolOperationMode: parseBool(rawCapabilities.hasCoolOperationMode),
      hasHeatOperationMode: parseBool(rawCapabilities.hasHeatOperationMode),
      hasAutoOperationMode: parseBool(rawCapabilities.hasAutoOperationMode),
      hasDryOperationMode: parseBool(rawCapabilities.hasDryOperationMode),
    };

    return {
      id: String(unit.id),
      name: typeof unit.givenDisplayName === "string" ? unit.givenDisplayName : "ATA",
      type: "ata",
      power: parseBool(settings.Power),
      operationMode: settings.OperationMode ?? "Heat",
      setTemperature: parseFloatValue(settings.SetTemperature),
      roomTemperature: parseFloatValue(settings.RoomTemperature),
      setFanSpeed: normalizeAtaFanSpeed(settings.SetFanSpeed ?? null),
      vaneVerticalDirection: normalizeAtaVaneVertical(
        settings.VaneVerticalDirection ?? null,
      ),
      inStandbyMode: parseBool(settings.InStandbyMode),
      capabilities: mergedCapabilities,
    };
  }

  private mapAtwUnit(unit: Record<string, unknown>): AtwUnit {
    const settings = parseSettings(unit.settings);
    const rawCapabilities =
      typeof unit.capabilities === "object" && unit.capabilities !== null
        ? (unit.capabilities as Record<string, unknown>)
        : {};
    const hasCoolingFromSettings = parseBool(settings.HasCoolingMode);
    const mergedCapabilities = {
      ...ATW_DEFAULT_CAPABILITIES,
      hasHotWater: parseBool(rawCapabilities.hasHotWater),
      hasCoolingMode: hasCoolingFromSettings || parseBool(rawCapabilities.hasCoolingMode),
      hasHalfDegrees: parseBool(rawCapabilities.hasHalfDegrees),
      hasZone2: parseBool(rawCapabilities.hasZone2),
      hasStandby: parseBool(rawCapabilities.hasStandby),
    };

    return {
      id: String(unit.id),
      name: typeof unit.givenDisplayName === "string" ? unit.givenDisplayName : "ATW",
      type: "atw",
      power: parseBool(settings.Power),
      operationModeZone1: settings.OperationModeZone1 ?? "HeatRoomTemperature",
      operationStatus: settings.OperationMode ?? "Stop",
      setTemperatureZone1: parseFloatValue(settings.SetTemperatureZone1),
      roomTemperatureZone1: parseFloatValue(settings.RoomTemperatureZone1),
      setTankWaterTemperature: parseFloatValue(settings.SetTankWaterTemperature),
      tankWaterTemperature: parseFloatValue(settings.TankWaterTemperature),
      forcedHotWaterMode: parseBool(settings.ForcedHotWaterMode),
      inStandbyMode: parseBool(settings.InStandbyMode),
      capabilities: mergedCapabilities,
    };
  }

  private async updateAta(
    unitId: string,
    updates: Partial<AtaUpdatePayload>,
  ): Promise<void> {
    const payload: AtaUpdatePayload = {
      power: null,
      operationMode: null,
      setTemperature: null,
      setFanSpeed: null,
      vaneVerticalDirection: null,
      vaneHorizontalDirection: null,
      inStandbyMode: null,
      temperatureIncrementOverride: null,
      ...updates,
    };
    await this.apiRequest("PUT", `/api/ataunit/${unitId}`, payload);
  }

  private async updateAtw(
    unitId: string,
    updates: Partial<AtwUpdatePayload>,
  ): Promise<void> {
    const payload: AtwUpdatePayload = {
      power: null,
      setTankWaterTemperature: null,
      forcedHotWaterMode: null,
      setTemperatureZone1: null,
      setTemperatureZone2: null,
      operationModeZone1: null,
      operationModeZone2: null,
      inStandbyMode: null,
      setHeatFlowTemperatureZone1: null,
      setCoolFlowTemperatureZone1: null,
      setHeatFlowTemperatureZone2: null,
      setCoolFlowTemperatureZone2: null,
      ...updates,
    };
    await this.apiRequest("PUT", `/api/atwunit/${unitId}`, payload);
  }

  private async apiRequest(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    payload?: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await this.http.request({
      method,
      url: `${BASE_URL}${path}`,
      headers: {
        Accept: "application/json",
        "x-csrf": "1",
        Referer: `${BASE_URL}/dashboard`,
        ...(payload ? { "Content-Type": "application/json" } : {}),
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });

    if (response.status === 401) {
      throw new Error("Unauthorized");
    }

    if (response.status >= 400) {
      throw new Error(`API error ${response.status}`);
    }

    if (!response.text) {
      return null;
    }

    try {
      return JSON.parse(response.text) as unknown;
    } catch {
      return response.text;
    }
  }
}
