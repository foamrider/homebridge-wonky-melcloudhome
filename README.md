# homebridge-wonky-melcloudhome

> **Disclaimer:** This plugin was vibe-coded for personal use. There is no support, no guarantees, and no npm package. I made the code public in case someone finds it useful as a starting point for developing a proper plugin. Use at your own risk.

Homebridge platform plugin for Mitsubishi Electric [MELCloud Home](https://melcloudhome.com) devices. Exposes Air-to-Air (ATA) and Air-to-Water (ATW) heat pump units to Apple HomeKit via Homebridge.

The authentication and API patterns are based on the [melcloudhome](https://github.com/frigidaire/melcloudhome) Home Assistant integration (MIT licensed).

## Supported Devices

### Air-to-Air (ATA)
- **HeaterCooler** -- Power, operation mode (heat/cool/auto), target temperature, current room temperature
- **Fan** (optional) -- Fan speed with auto mode, swing mode for vertical vane
- **Standby switch** (optional) -- Toggle standby mode

### Air-to-Water (ATW)
- **HeaterCooler** -- Zone 1 power, operation mode, target and current temperature
- **DHW Thermostat** (optional) -- Domestic hot water target and current tank temperature
- **DHW Priority switch** (optional) -- Force hot water mode
- **Standby switch** (optional) -- Toggle standby mode

## Installation

This plugin is **not published to npm**. To install it locally:

1. Build the plugin:
   ```bash
   npm install
   npm run build
   ```

2. Copy the built files to your Homebridge server, then install from the local path inside the Homebridge environment:
   ```bash
   npm install /path/to/homebridge-wonky-melcloudhome
   ```

   For Docker-based setups, mount the directory and install from the mount point:
   ```bash
   docker exec <container> npm install /melcloudhome-homebridge
   ```

3. Restart Homebridge.

## Configuration

Add the platform to your Homebridge `config.json`:

```json
{
  "platform": "MelCloudHome",
  "email": "your@email.com",
  "password": "your-password"
}
```

### Optional Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `pollingIntervalSeconds` | `60` | How often to poll device state (min 30) |
| `enableFan` | `true` | Expose fan speed and swing as a separate Fanv2 service |
| `enableSwing` | `true` | Enable vane swing control on the fan service |
| `enableStandby` | `false` | Expose a switch for standby mode |
| `enableDhw` | `true` | Expose DHW thermostat and priority switch (ATW only) |

The Homebridge UI config schema is included for visual configuration.

## How It Works

- Authenticates via the MELCloud Home Cognito-based login flow (browser-like OAuth with cookie session)
- Discovers all ATA and ATW units from the user context API
- Polls device state at a configurable interval
- Sends control commands via PUT requests to the MELCloud API
- Re-authenticates automatically on session expiry (401)
- All requests are paced with a minimum 500ms interval to avoid rate limiting

## Limitations

- No energy monitoring or outdoor temperature sensor (endpoints exist but are not implemented)
- No ATW Zone 2 support
- ATW flow temperature and curve modes are not exposed
- Vertical vane control is limited to swing on/off (no positional control)
- No horizontal vane control
- Session lifetime is ~8 hours; the plugin handles re-authentication but there may be brief gaps

## License

MIT
