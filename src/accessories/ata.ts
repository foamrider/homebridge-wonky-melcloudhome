import type {
  API,
  CharacteristicValue,
  Logger,
  PlatformAccessory,
  Service,
} from "homebridge";

import type { MelCloudClient } from "../client/melcloud";
import type { AtaUnit, MelCloudHomeConfig } from "../types";
import {
  ATA_FAN_SPEEDS,
  ATA_OPERATION_MODES,
  getAtaTemperatureRange,
} from "../utils/mapping";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export class AtaAccessory {
  private readonly log: Logger;
  private readonly accessory: PlatformAccessory;
  private readonly api: API;
  private readonly client: MelCloudClient;
  private readonly config: MelCloudHomeConfig;
  private readonly service: Service;
  private fanService?: Service;
  private standbyService?: Service;
  private unit: AtaUnit;

  constructor(
    log: Logger,
    accessory: PlatformAccessory,
    api: API,
    client: MelCloudClient,
    config: MelCloudHomeConfig,
    unit: AtaUnit,
  ) {
    this.log = log;
    this.accessory = accessory;
    this.api = api;
    this.client = client;
    this.config = config;
    this.unit = unit;

    this.accessory.context.unitId = unit.id;
    this.accessory.context.type = "ata";

    this.service =
      accessory.getService(api.hap.Service.HeaterCooler) ??
      accessory.addService(api.hap.Service.HeaterCooler);
    this.service.setCharacteristic(api.hap.Characteristic.Name, unit.name);

    if (config.enableFan && unit.capabilities.numberOfFanSpeeds > 0) {
      this.fanService =
        accessory.getService(api.hap.Service.Fanv2) ??
        accessory.addService(api.hap.Service.Fanv2, `${unit.name} Fan`);
      this.fanService.setCharacteristic(api.hap.Characteristic.Name, `${unit.name} Fan`);
    }

    if (config.enableStandby && unit.capabilities.hasStandby) {
      this.standbyService =
        accessory.getService("Standby") ??
        accessory.addService(api.hap.Service.Switch, "Standby", "standby");
      this.standbyService.setCharacteristic(api.hap.Characteristic.Name, `${unit.name} Standby`);
    }

    this.configureCharacteristics();
  }

  update(unit: AtaUnit): void {
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
      .onGet(() => this.unit.roomTemperature ?? 0);

    this.service
      .getCharacteristic(Characteristic.TargetHeaterCoolerState)
      .onGet(() => this.getTargetState())
      .onSet((value) => this.handleTargetState(value));

    this.service
      .getCharacteristic(Characteristic.CurrentHeaterCoolerState)
      .onGet(() => this.getCurrentState());

    this.service
      .getCharacteristic(Characteristic.HeatingThresholdTemperature)
      .onGet(() => this.unit.setTemperature ?? 20)
      .onSet((value) => this.handleTargetTemperature(value));

    this.service
      .getCharacteristic(Characteristic.CoolingThresholdTemperature)
      .onGet(() => this.unit.setTemperature ?? 24)
      .onSet((value) => this.handleTargetTemperature(value));

    this.service
      .getCharacteristic(Characteristic.TemperatureDisplayUnits)
      .onGet(() => Characteristic.TemperatureDisplayUnits.CELSIUS);

    if (this.fanService) {
      this.fanService
        .getCharacteristic(Characteristic.Active)
        .onGet(() => (this.unit.power ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE))
        .onSet((value) => this.handleFanActive(value));

      this.fanService
        .getCharacteristic(Characteristic.TargetFanState)
        .onGet(() => this.getTargetFanState())
        .onSet((value) => this.handleTargetFanState(value));

      this.fanService
        .getCharacteristic(Characteristic.RotationSpeed)
        .setProps({ minValue: 0, maxValue: 100, minStep: 1 })
        .onGet(() => this.getRotationSpeed())
        .onSet((value) => this.handleRotationSpeed(value));

      if (this.config.enableSwing) {
        this.fanService
          .getCharacteristic(Characteristic.SwingMode)
          .onGet(() => this.getSwingMode())
          .onSet((value) => this.handleSwingMode(value));
      }
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
    const state = this.getTargetState();

    this.service.updateCharacteristic(
      Characteristic.Active,
      this.unit.power ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE,
    );
    this.service.updateCharacteristic(
      Characteristic.CurrentTemperature,
      this.unit.roomTemperature ?? 0,
    );
    this.service.updateCharacteristic(Characteristic.TargetHeaterCoolerState, state);
    this.service.updateCharacteristic(
      Characteristic.CurrentHeaterCoolerState,
      this.getCurrentState(),
    );
    this.service.updateCharacteristic(
      Characteristic.HeatingThresholdTemperature,
      this.unit.setTemperature ?? 20,
    );
    this.service.updateCharacteristic(
      Characteristic.CoolingThresholdTemperature,
      this.unit.setTemperature ?? 24,
    );

    if (this.fanService) {
      this.fanService.updateCharacteristic(
        Characteristic.Active,
        this.unit.power ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE,
      );
      this.fanService.updateCharacteristic(
        Characteristic.TargetFanState,
        this.getTargetFanState(),
      );
      this.fanService.updateCharacteristic(
        Characteristic.RotationSpeed,
        this.getRotationSpeed(),
      );
      if (this.config.enableSwing) {
        this.fanService.updateCharacteristic(
          Characteristic.SwingMode,
          this.getSwingMode(),
        );
      }
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
    switch (this.unit.operationMode) {
      case "Heat":
        return Characteristic.TargetHeaterCoolerState.HEAT;
      case "Cool":
        return Characteristic.TargetHeaterCoolerState.COOL;
      case "Automatic":
        return Characteristic.TargetHeaterCoolerState.AUTO;
      case "Dry":
        return Characteristic.TargetHeaterCoolerState.COOL;
      case "Fan":
        return Characteristic.TargetHeaterCoolerState.AUTO;
      default:
        return Characteristic.TargetHeaterCoolerState.AUTO;
    }
  }

  private getCurrentState(): number {
    const { Characteristic } = this.api.hap;
    if (!this.unit.power) {
      return Characteristic.CurrentHeaterCoolerState.INACTIVE;
    }

    const target = this.getTargetState();
    if (target === Characteristic.TargetHeaterCoolerState.HEAT) {
      return Characteristic.CurrentHeaterCoolerState.HEATING;
    }
    if (target === Characteristic.TargetHeaterCoolerState.COOL) {
      return Characteristic.CurrentHeaterCoolerState.COOLING;
    }

    return Characteristic.CurrentHeaterCoolerState.IDLE;
  }

  private getTargetFanState(): number {
    const { Characteristic } = this.api.hap;
    return this.unit.setFanSpeed === "Auto"
      ? Characteristic.TargetFanState.AUTO
      : Characteristic.TargetFanState.MANUAL;
  }

  private getRotationSpeed(): number {
    const speed = this.unit.setFanSpeed ?? "Auto";
    if (speed === "Auto") {
      return 0;
    }
    const index = ATA_FAN_SPEEDS.indexOf(speed as typeof ATA_FAN_SPEEDS[number]);
    if (index <= 0) {
      return 0;
    }
    return Math.round((index / (ATA_FAN_SPEEDS.length - 1)) * 100);
  }

  private getSwingMode(): number {
    const { Characteristic } = this.api.hap;
    return this.unit.vaneVerticalDirection === "Swing"
      ? Characteristic.SwingMode.SWING_ENABLED
      : Characteristic.SwingMode.SWING_DISABLED;
  }

  private async handleActive(value: CharacteristicValue): Promise<void> {
    try {
      const active = value === this.api.hap.Characteristic.Active.ACTIVE;
      await this.client.setAtaPower(this.unit.id, active);
    } catch (error) {
      this.log.error("Failed to set ATA power: %s", error);
      throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  private async handleTargetState(value: CharacteristicValue): Promise<void> {
    try {
      const { Characteristic } = this.api.hap;
      let mode = "Automatic";
      if (value === Characteristic.TargetHeaterCoolerState.HEAT) {
        mode = "Heat";
      } else if (value === Characteristic.TargetHeaterCoolerState.COOL) {
        mode = "Cool";
      } else if (value === Characteristic.TargetHeaterCoolerState.AUTO) {
        mode = "Automatic";
      }

      if (!ATA_OPERATION_MODES.includes(mode as typeof ATA_OPERATION_MODES[number])) {
        this.log.warn("Unsupported ATA mode requested: %s", mode);
        return;
      }
      await this.client.setAtaMode(this.unit.id, mode);
    } catch (error) {
      this.log.error("Failed to set ATA mode: %s", error);
      throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  private async handleTargetTemperature(value: CharacteristicValue): Promise<void> {
    try {
      const desired = Number(value);
      if (!Number.isFinite(desired)) {
        return;
      }
      const range = getAtaTemperatureRange(this.unit.operationMode, this.unit.capabilities);
      const clamped = clamp(desired, range.min, range.max);
      await this.client.setAtaTemperature(this.unit.id, clamped);
    } catch (error) {
      this.log.error("Failed to set ATA temperature: %s", error);
      throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  private async handleFanActive(value: CharacteristicValue): Promise<void> {
    try {
      // Fan Active mirrors unit power; setting fan to inactive should not power off the unit.
      if (value === this.api.hap.Characteristic.Active.INACTIVE) {
        await this.client.setAtaFanSpeed(this.unit.id, "Auto");
      }
    } catch (error) {
      this.log.error("Failed to set ATA fan active: %s", error);
      throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  private async handleTargetFanState(value: CharacteristicValue): Promise<void> {
    try {
      const { Characteristic } = this.api.hap;
      if (value === Characteristic.TargetFanState.AUTO) {
        await this.client.setAtaFanSpeed(this.unit.id, "Auto");
        return;
      }
      if (!this.unit.setFanSpeed || this.unit.setFanSpeed === "Auto") {
        await this.client.setAtaFanSpeed(this.unit.id, "One");
      }
    } catch (error) {
      this.log.error("Failed to set ATA fan state: %s", error);
      throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  private async handleRotationSpeed(value: CharacteristicValue): Promise<void> {
    try {
      const speed = Number(value);
      if (!Number.isFinite(speed)) {
        return;
      }
      if (speed <= 0) {
        await this.client.setAtaFanSpeed(this.unit.id, "Auto");
        return;
      }
      const index = Math.min(
        ATA_FAN_SPEEDS.length - 1,
        Math.max(1, Math.round((speed / 100) * (ATA_FAN_SPEEDS.length - 1))),
      );
      await this.client.setAtaFanSpeed(this.unit.id, ATA_FAN_SPEEDS[index]);
    } catch (error) {
      this.log.error("Failed to set ATA fan speed: %s", error);
      throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  private async handleSwingMode(value: CharacteristicValue): Promise<void> {
    try {
      const { Characteristic } = this.api.hap;
      const direction =
        value === Characteristic.SwingMode.SWING_ENABLED ? "Swing" : "Auto";
      await this.client.setAtaVaneVertical(this.unit.id, direction);
    } catch (error) {
      this.log.error("Failed to set ATA swing mode: %s", error);
      throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  private async handleStandby(value: CharacteristicValue): Promise<void> {
    try {
      await this.client.setAtaStandby(this.unit.id, value === true);
    } catch (error) {
      this.log.error("Failed to set ATA standby: %s", error);
      throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }
}
