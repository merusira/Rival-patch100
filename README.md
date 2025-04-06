# Rival

A zero-ping client-side emulation mod for TeraToolbox.

## Features

- Instant client-side feedback for skill activations
- Predictive validation of skills before sending to server
- Intelligent packet queue system for optimal timing
- State synchronization to maintain consistency with server
- Adaptive timing based on network conditions

## Installation

1. Download the mod .zip from the releases page
2. Extract the .zip contents to your `mods` folder
3. Start TeraToolbox

## Usage

The mod is enabled by default. You can configure it using the settings menu in TeraToolbox or by editing the `settings.json` file.

### Commands

- `rival help` - Show help message
- `rival` - Toggle the mod on/off
- `rival debug` - Toggle debug mode
- `rival ping` - Show current ping statistics
- `rival reload` - Reload the mod

## Configuration

You can configure the mod by editing the `settings.json` file or using the settings menu in TeraToolbox.

### Settings

- `enabled` - Enable/disable the mod
- `debug` - Debug settings
  - `enabled` - Enable/disable debug mode
  - `skills` - Log skill information
  - `packets` - Log packet information
  - `abnormals` - Log abnormality information
  - `ping` - Log ping information
- `ping` - Ping measurement settings
  - `timeout` - Ping timeout in milliseconds
  - `interval` - Ping measurement interval in milliseconds
  - `samples` - Number of ping samples to keep
- `skills` - Skill prediction settings
  - `enabled` - Enable/disable skill prediction
  - `retryCount` - Number of times to retry sending a skill
  - `retryMs` - Delay between retries in milliseconds
  - `retryJittercomp` - Jitter compensation for retries
  - `serverTimeout` - Server timeout in milliseconds
  - `forceClipStrict` - Strict force clipping
  - `defendSuccessStrict` - Strict defend success
  - `delayOnFail` - Delay on fail
  - `jitterCompensation` - Enable jitter compensation
  - `chargeJitterMax` - Maximum charge jitter
- `emulation` - Emulation settings
  - `enableInstantSkills` - Enable instant skills
  - `enableInstantChains` - Enable instant chain skills
  - `enablePredictiveRetries` - Enable predictive retries
- `packets` - Packet queue settings
  - `queueThrottleTime` - Queue throttle time in milliseconds
  - `maxQueueSize` - Maximum queue size

## Support

If you encounter any issues, please report them on the [GitHub issues page](https://github.com/merusira/Tera-Rival/issues).

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- Thanks to merusira and the TeraToolbox team for creating the toolbox.
- Thanks to the Tera community for their support.