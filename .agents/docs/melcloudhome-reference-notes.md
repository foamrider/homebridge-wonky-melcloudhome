# MELCloud Home reference notes

## Scope

This summarizes API behavior from the `melcloudhome` Home Assistant integration and docs, to inform a Homebridge plugin implementation.

## License

- `melcloudhome` is MIT licensed. Reuse of patterns and documentation is permitted with attribution per the license.

## Base URLs

- Production: `https://melcloudhome.com`
- Auth (Cognito): `https://live-melcloudhome.auth.eu-west-1.amazoncognito.com`
- Auth base: `https://auth.melcloudhome.com`

## Auth and session

- Auth flow: browser-like OAuth via Cognito.
- Start at `GET /bff/login?returnUrl=/dashboard` and follow redirects to Cognito login.
- Extract CSRF token from Cognito login HTML (`<input name="_csrf" ...>`).
- Submit credentials with `application/x-www-form-urlencoded` to the Cognito login URL.
- Success is a redirect back to `https://melcloudhome.com/...` (dashboard).
- Session is cookie-based, no access token required for API calls.
- Session lifetime observed around 8 hours. A `401` indicates expired session.
- `GET /api/user/context` can be used to validate session.

## Required headers

- For all API calls:
  - `x-csrf: 1`
  - `referer: https://melcloudhome.com/dashboard`
  - `Accept: application/json`
- Use a Chrome-like `User-Agent` to avoid bot detection.
- Maintain a cookie jar; avoid unsafe cookie handling to preserve `__Secure-` cookies.

## Primary discovery endpoint

- `GET /api/user/context`
- Returns all buildings and devices, current state, schedules, and capabilities.
- Buildings arrays:
  - Owned: `buildings[]`
  - Guest/shared: `guestBuildings[]`
- Device arrays:
  - Air-to-Air (ATA): `buildings[].airToAirUnits[]`
  - Air-to-Water (ATW): `buildings[].airToWaterUnits[]`
- Device state in `settings[]` as name/value strings (requires parsing).

## Control endpoints

General:
- Control endpoints require a complete payload with all fields present.
- Unchanged fields should be `null`.
- Responses are `200 OK` with empty body.

ATA (Air-to-Air):
- `PUT /api/ataunit/{unit_id}`
- Key fields:
  - `power` (boolean)
  - `operationMode` (string: `Heat`, `Cool`, `Automatic`, `Dry`, `Fan`)
  - `setTemperature` (float, 0.5 or 1.0 increments depending on capability)
  - `setFanSpeed` (string: `Auto`, `One`, `Two`, `Three`, `Four`, `Five`)
  - `vaneVerticalDirection` (string: `Auto`, `Swing`, `One`-`Five`)
  - `vaneHorizontalDirection` (string: `Auto`, `Swing`, `Left`, `LeftCentre`, `Centre`, `RightCentre`, `Right`)
  - `temperatureIncrementOverride` (always `null` in observed traffic)
  - `inStandbyMode` (boolean)

ATW (Air-to-Water):
- `PUT /api/atwunit/{unit_id}`
- Key fields:
  - `power` (boolean)
  - `setTemperatureZone1` (float, 10-30)
  - `setTankWaterTemperature` (float, 40-60)
  - `operationModeZone1` (string: `HeatRoomTemperature`, `HeatFlowTemperature`, `HeatCurve`)
  - `forcedHotWaterMode` (boolean)
  - Zone 2 fields exist but require `hasZone2=true`
- `OperationMode` in settings is STATUS (Stop/HotWater/zone mode), not a control field.

## Device capabilities

ATA capabilities:
- Fan speed count, min/max temps by mode, half-degree support, swing/air direction, energy meter.
- Use device capabilities to gate available HVAC modes and set min/max temperatures.

ATW capabilities:
- Energy flags: `hasEstimatedEnergyConsumption`, `hasEstimatedEnergyProduction`, `hasMeasuredEnergyConsumption`, `hasMeasuredEnergyProduction`.
- `hasCoolingMode` may appear in settings or capabilities; cooling modes are `CoolRoomTemperature` and `CoolFlowTemperature`.
- Temperature range from API can be unreliable; use safe defaults (Zone: 10-30, DHW: 40-60).

## Energy endpoints

- `GET /api/telemetry/energy/{unit_id}`

ATA:
- Query: `measure=cumulative_energy_consumed_since_last_upload`
- Values are cumulative and appear to be Wh; convert to kWh for display.

ATW:
- Query: `measure=interval_energy_consumed` or `interval_energy_produced`
- Values appear in kWh already; no conversion.
- Create energy sensors only if capability flags indicate data is available.

## Telemetry and reports

ATA outdoor temperature:
- `GET /api/report/trendsummary?unitId={id}&from=...&to=...`
- Datasets include `OUTDOOR_TEMPERATURE` when supported.

ATW telemetry:
- `GET /api/telemetry/actual/{unit_id}?from=...&to=...&measure=flow_temperature` (and similar measures).
- Response format is `measureData[]` with timestamped string values.

## Parsing notes

- Many values are returned as strings, including booleans and numbers.
- ATA `SetFanSpeed` and `VaneVerticalDirection` in settings may be numeric strings.
- ATA horizontal vane values use British spelling; map American spellings if encountered.

## Polling and pacing

- Use request pacing to avoid rate limiting (integration uses 0.5s minimum spacing).
- Suggested polling intervals from the reference integration:
  - Core state (`/api/user/context`): 60s
  - Energy: 30m
  - Outdoor temperature: 30m

## Implementation cautions

- Use only values observed from the official UI. Avoid speculative enums or ranges.
- Treat ATW `OperationMode` as read-only status.
- Support guest buildings by merging `guestBuildings` into discovery.
