import type {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
} from "homebridge";

import { PLATFORM_NAME, PLUGIN_NAME } from "./settings";
import { parseConfig } from "./config";
import type { MelCloudHomeConfig, MelCloudUnit } from "./types";
import { MelCloudClient } from "./client/melcloud";
import { RequestPacer } from "./utils/pacer";
import { HttpClient } from "./utils/http";
import { AtaAccessory } from "./accessories/ata";
import { AtwAccessory } from "./accessories/atw";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

export class MelCloudHomePlatform implements DynamicPlatformPlugin {
  private accessories: PlatformAccessory[] = [];
  private readonly client?: MelCloudClient;
  private readonly configData?: MelCloudHomeConfig;
  private pollingHandle?: NodeJS.Timeout;
  private accessoryMap = new Map<string, AtaAccessory | AtwAccessory>();

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    if (!config) {
      this.log.warn("No platform config found; skipping setup.");
      return;
    }

    this.configData = parseConfig(this.log, this.config);
    const pacer = new RequestPacer(500);
    const http = new HttpClient(pacer, DEFAULT_USER_AGENT);
    this.client = new MelCloudClient(this.log, http);

    this.log.info(
      "%s (%s) platform initialized.",
      PLUGIN_NAME,
      PLATFORM_NAME,
    );

    this.api.on("didFinishLaunching", () => {
      this.log.info("Homebridge finished launching.");
      void this.startPolling();
    });

    this.api.on("shutdown", () => {
      if (this.pollingHandle) {
        clearInterval(this.pollingHandle);
      }
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.accessories.push(accessory);
  }

  private async startPolling(): Promise<void> {
    if (!this.client || !this.configData) {
      return;
    }

    try {
      await this.client.login(this.configData.email, this.configData.password);
      await this.refreshDevices();
    } catch (error) {
      this.log.error("Failed to start MELCloud polling: %s", error);
      return;
    }

    const intervalMs = this.configData.polling.pollingIntervalSeconds * 1000;
    this.pollingHandle = setInterval(() => {
      void this.refreshDevices();
    }, intervalMs);
  }

  private async refreshDevices(): Promise<void> {
    if (!this.client || !this.configData) {
      return;
    }

    try {
      const units = await this.client.fetchUnits();
      this.log.debug("Discovered %s MELCloud units.", units.length);
      this.applyAccessoryChanges(units);
    } catch (error) {
      if (error instanceof Error && error.message === "Unauthorized") {
        this.log.warn("Session expired; re-authenticating.");
        try {
          await this.client.login(this.configData.email, this.configData.password);
          const units = await this.client.fetchUnits();
          this.applyAccessoryChanges(units);
        } catch (reAuthError) {
          this.log.error("Re-authentication failed: %s", reAuthError);
        }
        return;
      }

      this.log.error("Failed to refresh MELCloud devices: %s", error);
    }
  }

  private applyAccessoryChanges(units: MelCloudUnit[]): void {
    if (!this.client || !this.configData) {
      return;
    }

    const existing = new Map(
      this.accessories.map((accessory) => [accessory.UUID, accessory]),
    );

    for (const unit of units) {
      const uuid = this.api.hap.uuid.generate(unit.id);
      const existingAccessory = existing.get(uuid);
      if (existingAccessory) {
        const handler = this.accessoryMap.get(uuid);
        if (handler) {
          if (unit.type === "ata" && handler instanceof AtaAccessory) {
            handler.update(unit);
          } else if (unit.type === "atw" && handler instanceof AtwAccessory) {
            handler.update(unit);
          }
        } else {
          this.registerAccessory(existingAccessory, unit, this.client, this.configData);
        }
        existing.delete(uuid);
        continue;
      }

      this.log.info("Registering new unit: %s", unit.name);
      const accessory = new this.api.platformAccessory(unit.name, uuid);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
      this.registerAccessory(accessory, unit, this.client, this.configData);
    }

    for (const accessory of existing.values()) {
      this.log.info("Removing unit: %s", accessory.displayName);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories = this.accessories.filter(
        (item) => item.UUID !== accessory.UUID,
      );
      this.accessoryMap.delete(accessory.UUID);
    }
  }

  private registerAccessory(
    accessory: PlatformAccessory,
    unit: MelCloudUnit,
    client: MelCloudClient,
    config: MelCloudHomeConfig,
  ): void {
    if (unit.type === "ata") {
      const handler = new AtaAccessory(
        this.log,
        accessory,
        this.api,
        client,
        config,
        unit,
      );
      this.accessoryMap.set(accessory.UUID, handler);
      return;
    }

    if (unit.type === "atw") {
      const handler = new AtwAccessory(
        this.log,
        accessory,
        this.api,
        client,
        config,
        unit,
      );
      this.accessoryMap.set(accessory.UUID, handler);
    }
  }
}
