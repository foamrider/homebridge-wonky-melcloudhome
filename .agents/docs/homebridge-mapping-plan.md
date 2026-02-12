# Homebridge mapping plan

## Goal

Map MELCloud Home ATA and ATW devices to HomeKit services and characteristics with safe defaults, minimal API load, and clear fallbacks.

## Plugin shape

- Homebridge platform plugin.
- One accessory per unit, stable UUID based on MELCloud unit id.
- Accessory name: unit display name, optionally prefixed with building name if duplicate.
- Shared client with request pacing and polling scheduler.

## Discovery and polling

- Primary state: `GET /api/user/context` every 60s.
- Optional data:
  - ATA outdoor temperature: `GET /api/report/trendsummary` every 30m.
  - Energy: every 30m (ATA and ATW when supported).
- Minimum request spacing: 0.5s across all calls.

## ATA (Air-to-Air) mapping

Primary service (default): `Service.HeaterCooler`.

Characteristics:
- `Active` -> `power`.
- `CurrentTemperature` -> `RoomTemperature`.
- `TargetHeaterCoolerState` -> `operationMode` mapping:
  - Heat -> HEAT
  - Cool -> COOL
  - Automatic -> AUTO
  - Dry -> COOL (default), optional config to expose as a separate dehumidifier later.
  - Fan -> AUTO (default) with Fan service handling actual fan control.
- `CurrentHeaterCoolerState` -> based on `power` and mode.
  - If power off -> INACTIVE.
  - Heat/Cool -> HEATING/COOLING when setpoint differs from room temp, otherwise IDLE.
  - Automatic -> choose HEATING/COOLING by comparing room temp to setpoint.
- `HeatingThresholdTemperature` or `CoolingThresholdTemperature` -> `setTemperature` (use the one matching target state; for AUTO set both to same value).
- `TemperatureDisplayUnits` -> Celsius.

Fan control (optional): `Service.Fanv2`.
- `TargetFanState` -> Auto when `setFanSpeed` is Auto, Manual otherwise.
- `RotationSpeed` -> map discrete speeds to 20/40/60/80/100.
- `Active` -> tied to unit `power`.

Swing control (optional): `SwingMode` on Fan service.
- Enable -> set `vaneVerticalDirection` to Swing.
- Disable -> set `vaneVerticalDirection` to Auto.
- Horizontal vane positions are not exposed by default.

Other optional services:
- `Service.Switch` "Standby" -> `inStandbyMode`.
- `Service.TemperatureSensor` "Outdoor" -> from trendsummary if supported.
- `StatusFault` -> `isInError`.

Validation and ranges:
- Use ATA capability ranges for min/max temperature.
- Respect `hasHalfDegreeIncrements` for target step.
- Normalize fan and vane values (numeric strings to words; British spelling for horizontal).

## ATW (Air-to-Water) mapping

Zone 1 service:
- Default: `Service.HeaterCooler`.
- `Active` -> `power`.
- `CurrentTemperature` -> `RoomTemperatureZone1`.
- `TargetHeaterCoolerState`:
  - HeatRoomTemperature / HeatFlowTemperature / HeatCurve -> HEAT.
  - CoolRoomTemperature / CoolFlowTemperature -> COOL (only if hasCoolingMode).
- `CurrentHeaterCoolerState` -> based on `OperationMode` status:
  - Stop -> IDLE.
  - HotWater -> IDLE (zone not active).
  - Heat* / Cool* -> HEATING or COOLING.
- `HeatingThresholdTemperature` / `CoolingThresholdTemperature` -> `SetTemperatureZone1`.

Mode selection for zone 1 (optional):
- Expose `Service.Switch` for "Flow Mode" and "Curve Mode".
- When a mode switch is ON, set `operationModeZone1` accordingly.
- When both switches OFF, default to `HeatRoomTemperature`.
- Enforce mutual exclusion (turn the other off).

DHW service (if `hasHotWater`):
- Prefer `Service.WaterHeater` if available in HAP, otherwise fallback to `Service.Thermostat` (heat-only).
- Target temperature -> `SetTankWaterTemperature`.
- Current temperature -> `TankWaterTemperature`.
- `Service.Switch` "DHW Priority" -> `forcedHotWaterMode`.

Other optional services:
- `Service.Switch` "System Power" -> `power` (if not using `Active` as the only power control).
- `Service.TemperatureSensor` for telemetry measures (flow/return) if telemetry polling is enabled.
- `StatusFault` -> `isInError`.

Validation and ranges:
- Use safe hardcoded ranges: Zone 1 (10-30C), DHW (40-60C).
- Use `hasHalfDegrees` for heating step; cooling is always 1.0C.

## Energy support

- ATA: `measure=cumulative_energy_consumed_since_last_upload`, values are Wh -> convert to kWh.
- ATW: `measure=interval_energy_consumed` and `interval_energy_produced`, values are kWh.
- Expose energy via optional custom characteristics or leave out initially (HomeKit has no standard energy characteristics).

## Config and defaults

- Required: email, password.
- Optional:
  - polling intervals (context, energy, outdoor).
  - enable fan service, swing control, standby switch.
  - enable ATW flow/curve mode switches.
  - enable DHW accessory and priority switch.
  - enable energy extras.

## Non-goals for initial implementation

- Schedule endpoints (cloud schedules).
- Holiday mode and frost protection.
- Full vane position controls beyond swing.
