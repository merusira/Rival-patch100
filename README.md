# Rival - Zero-Ping Emulation Mod for TERA

### TERA patch 100.02 (rival-100).

## Introduction

Rival is a comprehensive zero-ping emulation mod for TERA, engineered to deliver seamless, low-latency gameplay by accurately predicting and replicating in-game actions with precision and reliability.

Unlike conventional ping reducers or basic prediction mods, Rival emulates TERA’s internal logic to such a degree that it significantly limits the server’s ability to reject or desync player inputs. It intercepts skill commands at the client level and executes them locally in real time, while simultaneously sending packets to the server—creating the effect of immediate responsiveness regardless of actual ping.

What sets Rival apart is its sophisticated understanding of TERA’s combat and skill architecture. It continually tracks the player’s state, movement, and surrounding environment, allowing it to determine with high accuracy what the server is likely to accept. By constantly monitoring server responses and adapting its behavior in real time, Rival maintains a level of synchronization that consistently results in fewer skill failures, ghosting, and rubberbanding than any other, significantly limiting interruptions to gameplay

The level of whats being emulated and its adaptive approach allows Rival to provide a smoother, more consistent experience, preserving the fast-paced, reactive combat TERA is known for—even across varying connection qualities.

## Installation

1. Works on ONLY [Tera Toolbox Atlas](https://github.com/merusira/tera-toolbox-atlas)
- If using any Toolbox version not Atlas, use [the other version, Any_Toolbox_Zero_Ping]https://github.com/merusira/Any_Toolbox_Zero_Ping_Emulation
2. You may use the "Get More Mods" tab in Tera Atlas to install, or download it directly and place it in your mod folder
-  If you download manually for Tera Atlas, place in the `patch100/mods` directory, as this verison of Rival is for patch 100
3. Start Tera Toolbox / Atlas and launch TERA
4. The mod will automatically load your race and class data upon character selection

## Incompatible Mods

Rival is not compatible with the following mods:
- rival-patch34
- skill-prediction
- ngsp
- ngsp_100
- ngsp_92
- ping-remover
- ping
- zero-ping-all-toolbox-patch100

These mods attempt to modify the same game mechanics and will conflict with Rival.

* It is recommended not to use the "library" mod simultaneously with Rival, as it may occasionally induce input lag.

## Features

### Zero-Ping Skill Emulation

Rival's core functionality is skill prediction and emulation. It:
- Predicts skill execution timing based on your network conditions
- Provides immediate client-side feedback for skill usage
- Synchronizes client and server actions to prevent desynchronization
- Supports all class/race combos and their unique skill mechanics

### Movement Emulation

Rival enhances movement abilities for a smoother experience:
- Dash emulation for instant response on movement skills
- Backstab prediction for precise positioning
- Teleport/jaunt emulation for mages and similar classes
- Position swap handling for relevant skills

### Anti-Desync System

The mod includes a sophisticated anti-desynchronization system that:
- Monitors position discrepancies between client and server
- Corrects player position when necessary to prevent rubber-banding
- Ensures smooth transitions between skills and movement

### Ping Monitoring

Rival continuously monitors your connection to the server:
- Tracks ping and jitter in real-time
- Adjusts skill timing based on current network conditions
- Provides optional on-screen display of network metrics

## A few of the core Plugins and Components

Rival is built with a modular architecture consisting of several specialized plugins:

### Core Emulation Plugins
- **emulation.js**: Handles skill execution timing, validation, and synchronization
- **emulation_effects.js**: Manages client-side prediction of movement abilities
- **smooth_block.js**: Improves blocking mechanics for tank classes

### Network and Performance Plugins
- **monitor.js**: Tracks network performance metrics including ping and jitter in real-time
- **anti_desync.js**: Prevents position desynchronization between client and server
- **abnormality.js**: Manages buffs and debuffs (abnormalities) timing
- **abnormality_effects.js**: Handles visual effects for abnormalities

### Class-Specific Plugins
- **cooldown.js**: Manages skill cooldown tracking and prediction
- **crowd_control.js**: Handles crowd control effects (stuns, knockdowns, etc.)
- **lockons.js**: Improves lock-on targeting mechanics
- **projectiles.js**: Enhances projectile skills prediction

### Utility Plugins
- **bugfix.js**: Fixes various game bugs and inconsistencies
- **debug.js**: Provides debugging tools and logging
- **hardcoded.js**: Contains hardcoded values and special cases
- **items.js**: Handles item usage prediction
- **recall.js**: Manages teleport and recall abilities

## Commands

All commands are prefixed with `/8 rival` in the in-game chat. Available commands:

| Command | Description |
|---------|-------------|
| `/8 rival` | Toggle the mod on/off |
| `/8 rival on` | Turn the mod on |
| `/8 rival off` | Turn the mod off |
| `/8 rival block` | Toggle smooth block functionality |
| `/8 rival delay [value]` | Set artificial delay in milliseconds |
| `/8 rival jaunt` | Toggle smooth jaunt functionality |
| `/8 rival dash [value]` | Set dash delay (default 25ms) |
| `/8 rival ping` | Toggle current real ping, average ping, and jitter displaying to chat every N seconds |
| `/8 rival ping [seconds]` | Toggle how many seconds pass before you see your updated network metrics (1-900) |
| `/8 rival debug` | Toggle debug mode |
| `/8 rival save [filename]` | Save logs to file |
| `/8 rival desync [value]` | Adjust position correction distance |
| `/8 rival tracker` | Display skill timing statistics |

## Configuration

### Config.json Settings

The `config.json` file contains the following settings:

```json
{
  "enabled": true,    // Whether the mod is enabled
  "block": true,      // Whether smooth block is enabled
  "jaunt": true,      // Whether jaunt emulation is enabled
  "debug": false,     // Whether debug mode is enabled
  "dash": 25,         // Dash distance/speed value
  "delay": 0          // Artificial delay in milliseconds
}
```

These settings can be modified directly in the file or through the in-game commands.

### Modifying skills.json

The `skills.json` file in the top directory contains configurations for all skills in the game, organized by class.
This file allows you to enable or disable zero-ping emulation for specific skills.
Some skills may cause you trouble and that is sad. Maybe we need to work out a bug,
its rare, but if all else is working great then it is recommended to simply disable emulation on that particular skill.

#### Structure

The file is structured as follows:
```json
{
  "class_name": {
    "skill_id": {
      "name": "Skill Name",
      "0": true,      // Base skill
      "10": true,     // Skill variant/stage 10
      "11": true      // Skill variant/stage 11
    }
  }
}
```

#### How to Disable Emulation for a Specific Skill

If you're experiencing issues with a particular skill, you can disable emulation for it:

1. Open `skills.json` in a text editor
2. Find your class section (e.g., "warrior", "archer", etc.)
3. Locate the skill by its ID or name
4. Change the value from `true` to `false` for the specific skill or variant

Example:
```json
"archer": {
  "3": {
    "name": "Radiant Arrow I",
    "0": false,    // Changed from true to false to disable emulation
    "10": true,
    "11": true,
    "12": true,
    "13": true
  }
}
```

This would disable emulation for the base version of Radiant Arrow while keeping it enabled for the variants.

* You should change all to false for a particular skill, unless you notice you only glitch under certain effects,
and you know which variant ids work fine.

#### Common Reasons to Modify skills.json

- Certain skills may behave unexpectedly with emulation, especially when the server masters made particular changes
- Race-specific mechanics might conflict with emulation
- Some skills might work better with server-side timing
- Personal preference for specific skill behaviors

## Troubleshooting

### Common Issues

1. **Skill Desynchronization**: If skills appear to cast but have no effect, try:
   - Increasing the artificial delay with `/8 rival delay 20`
   - Disabling emulation for that specific skill in skills.json

2. **Rubber-banding**: If your character frequently teleports back to previous positions:
   - Adjust the desync correction with `/8 rival desync 2`
   - Check your network stability

3. **Animation Glitches**: If skill animations appear broken:
   - Toggle the mod off and on with `/8 rival`
   - Restart the game client
   - Care how many mods you have active in Toolbox at once.
     The more mods hooking the same packets especially will only have negative effects.

### Using Debug Mode

Enable debug mode with `/8 rival debug` to get detailed logs in the console. This can help identify issues with specific skills or network conditions.

To save logs for troubleshooting:
1. Enable debug mode
2. Reproduce the issue
3. Use `/8 rival save issue_description` to save logs to a file
4. The logs will be saved to `[Rival]/logs/issue_description.txt`

## Support & Issues

If you encounter any problems or have questions about the Rival mod, you can reach out through the following channels:

- **GitHub Issues**: https://github.com/merusira/Rival-patch100/issues
- **Discord Community**: merusira#1688

When reporting issues, please try to include:
- Your system specifications
- TERA Toolbox or Atlas version (or place you download from)
- Detailed description of the problem
- Any error messages or logs (use `/8 rival save issue_name` to generate logs)
- Even copy/pasting logs printed to the toolbox log are great
- Steps to reproduce the issue

## Credits

### Special thanks to the many individuals who have contributed their time, skill, and dedication to the TERA modding community over the years:

    SaltyMonkey – Installer and modern UI components

    Mathicha & Pentagon – Early GUI development

    Foglio – Logo and visual design

    Meishu – Creator of the original Tera-Proxy core

    All Toolbox Translators – For making the tools accessible across languages

    All Mod Developers – Past and present, for continually expanding what’s possible

### Rival-Specific Acknowledgements

    Kasea – For designing and writing the elegant framework and core logic behind Rival’s emulation system

    merusira – For their dedication to deobfuscating, decrypting, and open-sourcing the module, making it possible for all players to enjoy a more consistent and responsive experience. Their ongoing refinement of Rival’s core systems have made it more stable and efficient. They continue to improve not only this mod, but others—including the proxy framework itself—to help ensure the best experience possible for the entire TERA community.

### To everyone listed and unlisted who’s contributed to keeping TERA alive and evolving—thank you.

## FIN