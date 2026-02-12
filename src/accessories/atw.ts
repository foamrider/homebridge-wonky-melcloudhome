import type {
  API,
  CharacteristicValue,
  Logger,
  PlatformAccessory,
  Service,
} from "homebridge";

import type { MelCloudClient } from "../client/melcloud";
import type { AtwUnit, MelCloudHomeConfig } from "../types";
import { ATW_COOL_MODES } from "../utils/mapping";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export class AtwAccessory {
  private readonly log: Logger;
  private readonly accessory: PlatformAccessory;
  private readonly api: API;
  private readonly client: MelCloudClient;
  private readonly config: MelCloudHomeConfig;
  private readonly service: Service;
  private dhwService?: Service;
  private dhwPriorityService?: Service;
  private standbyService?: Service;
  private unit: AtwUnit;

  constructor(
    log: Logger,
    accessory: PlatformAccessory,
    api: API,
    client: MelCloudClient,
    config: MelCloudHomeConfig,
    unit: AtwUnit,
  ) {
    this.log = log;
    this.accessory = accessory;
    this.api = api;
    this.client = client;
    this.config = config;
    this.unit = unit;

    this.accessory.context.unitId = unit.id;
    this.accessory.context.type = "atw";

    this.service =
      accessory.getService(api.hap.Service.HeaterCooler) ??
      accessory.addService(api.hap.Service.HeaterCooler);
    this.service.setCharacteristic(api.hap.Characteristic.Name, unit.name);

    if (config.enableDhw && unit.capabilities.hasHotWater) {
      this.dhwService =
        accessory.getService("Hot Water") ??
        accessory.addService(api.hap.Service.Thermostat, "Hot Water", "dhw");
      this.dhwService.setCharacteristic(
        api.hap.Characteristic.Name,
        `${unit.name} Hot Water`,
      );

      this.dhwPriorityService =
        accessory.getService("DHW Priority") ??
        accessory.addService(api.hap.Service.Switch, "DHW Priority", "dhwPriority");
      this.dhwPriorityService.setCharacteristic(
        api.hap.Characteristic.Name,
        `${unit.name} DHW Priority`,
      );
    }

    if (config.enableStandby && unit.capabilities.hasStandby) {
      this.standbyService =
        accessory.getService("Standby") ??
        accessory.addService(api.hap.Service.Switch, "Standby", "standby");
      this.standbyService.setCharacteristic(
        api.hap.Characteristic.Name,
        `${unit.name} Standby`,
      );
    }

    this.configureCharacteristics();
  }

  update(unit: AtwUnit): void {
    this.unit = unit;
    this.refreshCharacteristics();
  }

  private configureCharacteristics(): void {
    const { Characteristic } = this.api.hap;

    this.service
      .getCharacteristic(Characteristic.Active)
      .onGet(() => (this.unit.power ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE))
      .onSet((value) => this.handleActive(value));

    this.service
      .getCharacteristic(Characteristic.CurrentTemperature)
      .onGet(() => this.unit.roomTemperatureZone1 ?? 0);

    this.service
      .getCharacteristic(Characteristic.TargetHeaterCoolerState)
      .onGet(() => this.getTargetState())
      .onSet((value) => this.handleTargetState(value));

    this.service
      .getCharacteristic(Characteristic.CurrentHeaterCoolerState)
      .onGet(() => this.getCurrentState());

    this.service
      .getCharacteristic(Characteristic.HeatingThresholdTemperature)
      .onGet(() => this.unit.setTemperatureZone1 ?? 20)
      .onSet((value) => this.handleTargetTemperature(value, "heat"));

    this.service
      .getCharacteristic(Characteristic.CoolingThresholdTemperature)
      .onGet(() => this.unit.setTemperatureZone1 ?? 20)
      .onSet((value) => this.handleTargetTemperature(value, "cool"));

    this.service
      .getCharacteristic(Characteristic.TemperatureDisplayUnits)
      .onGet(() => Characteristic.TemperatureDisplayUnits.CELSIUS);

    if (this.dhwService) {
      this.dhwService
        .getCharacteristic(Characteristic.TargetTemperature)
        .onGet(() => this.unit.setTankWaterTemperature ?? 50)
        .onSet((value) => this.handleDhwTemperature(value));

      this.dhwService
        .getCharacteristic(Characteristic.CurrentTemperature)
        .onGet(() => this.unit.tankWaterTemperature ?? 0);

      this.dhwService
        .getCharacteristic(Characteristic.TargetHeatingCoolingState)
        .onGet(() => Characteristic.TargetHeatingCoolingState.HEAT);

      this.dhwService
        .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
        .onGet(() => Characteristic.CurrentHeatingCoolingState.HEAT);
    }

    if (this.dhwPriorityService) {
      this.dhwPriorityService
        .getCharacteristic(Characteristic.On)
        .onGet(() => this.unit.forcedHotWaterMode)
        .onSet((value) => this.handleDhwPriority(value));
    }

    if (this.standbyService) {
      this.standbyService
        .getCharacteristic(Characteristic.On)
        .onGet(() => this.unit.inStandbyMode)
        .onSet((value) => this.handleStandby(value));
    }

    this.refreshCharacteristics();
  }

  private refreshCharacteristics(): void {
    const { Characteristic } = this.api.hap;
    this.service.updateCharacteristic(
      Characteristic.Active,
      this.unit.power ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE,
    );
    this.service.updateCharacteristic(
      Characteristic.CurrentTemperature,
      this.unit.roomTemperatureZone1 ?? 0,
    );
    this.service.updateCharacteristic(
      Characteristic.TargetHeaterCoolerState,
      this.getTargetState(),
    );
    this.service.updateCharacteristic(
      Characteristic.CurrentHeaterCoolerState,
      this.getCurrentState(),
    );
    this.service.updateCharacteristic(
      Characteristic.HeatingThresholdTemperature,
      this.unit.setTemperatureZone1 ?? 20,
    );
    this.service.updateCharacteristic(
      Characteristic.CoolingThresholdTemperature,
      this.unit.setTemperatureZone1 ?? 20,
    );

    if (this.dhwService) {
      this.dhwService.updateCharacteristic(
        Characteristic.TargetTemperature,
        this.unit.setTankWaterTemperature ?? 50,
      );
      this.dhwService.updateCharacteristic(
        Characteristic.CurrentTemperature,
        this.unit.tankWaterTemperature ?? 0,
      );
    }

    if (this.dhwPriorityService) {
      this.dhwPriorityService.updateCharacteristic(
        Characteristic.On,
        this.unit.forcedHotWaterMode,
      );
    }

    if (this.standbyService) {
      this.standbyService.updateCharacteristic(
        Characteristic.On,
        this.unit.inStandbyMode,
      );
    }
  }

  private getTargetState(): number {
    const { Characteristic } = this.api.hap;
    if (
      ATW_COOL_MODES.includes(
        this.unit.operationModeZone1 as typeof ATW_COOL_MODES[number],
      )
    ) {
      return Characteristic.TargetHeaterCoolerState.COOL;
    }
    return Characteristic.TargetHeaterCoolerState.HEAT;
  }

  private getCurrentState(): number {
    const { Characteristic } = this.api.hap;
    if (!this.unit.power) {
      return Characteristic.CurrentHeaterCoolerState.INACTIVE;
    }
    if (this.unit.operationStatus === "Stop") {
      return Characteristic.CurrentHeaterCoolerState.IDLE;
    }
    if (this.unit.operationStatus === "HotWater") {
      return Characteristic.CurrentHeaterCoolerState.IDLE;
    }
    if (
      ATW_COOL_MODES.includes(
        this.unit.operationStatus as typeof ATW_COOL_MODES[number],
      )
    ) {
      return Characteristic.CurrentHeaterCoolerState.COOLING;
    }
    return Characteristic.CurrentHeaterCoolerState.HEATING;
  }

  private async handleActive(value: CharacteristicValue): Promise<void> {
    try {
      const active = value === this.api.hap.Characteristic.Active.ACTIVE;
      await this.client.setAtwPower(this.unit.id, active);
    } catch (error) {
      this.log.error("Failed to set ATW power: %s", error);
      throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  private async handleTargetState(value: CharacteristicValue): Promise<void> {
    try {
      const { Characteristic } = this.api.hap;
      if (value === Characteristic.TargetHeaterCoolerState.COOL) {
        if (!this.unit.capabilities.hasCoolingMode) {
          this.log.warn("Cooling requested but unit reports no cooling mode.");
          return;
        }
        await this.client.setAtwMode(this.unit.id, "CoolRoomTemperature");
        return;
      }

      if (value === Characteristic.TargetHeaterCoolerState.HEAT) {
        await this.client.setAtwMode(this.unit.id, "HeatRoomTemperature");
        return;
      }
    } catch (error) {
      this.log.error("Failed to set ATW mode: %s", error);
      throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  private async handleTargetTemperature(
    value: CharacteristicValue,
    mode: "heat" | "cool",
  ): Promise<void> {
    try {
      const desired = Number(value);
      if (!Number.isFinite(desired)) {
        return;
      }
      const clamped = clamp(desired, 10, 30);
      if (mode === "cool" && !this.unit.capabilities.hasCoolingMode) {
        return;
      }
      await this.client.setAtwZoneTemperature(this.unit.id, clamped);
    } catch (error) {
      this.log.error("Failed to set ATW temperature: %s", error);
      throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  private async handleDhwTemperature(value: CharacteristicValue): Promise<void> {
    try {
      const desired = Number(value);
      if (!Number.isFinite(desired)) {
        return;
      }
      const clamped = clamp(desired, 40, 60);
      await this.client.setAtwTankTemperature(this.unit.id, clamped);
    } catch (error) {
      this.log.error("Failed to set ATW DHW temperature: %s", error);
      throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  private async handleDhwPriority(value: CharacteristicValue): Promise<void> {
    try {
      await this.client.setAtwForcedHotWater(this.unit.id, value === true);
    } catch (error) {
      this.log.error("Failed to set ATW DHW priority: %s", error);
      throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  private async handleStandby(value: CharacteristicValue): Promise<void> {
    try {
      await this.client.setAtwStandby(this.unit.id, value === true);
    } catch (error) {
      this.log.error("Failed to set ATW standby: %s", error);
      throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }
}
