/*
 * Rival Mod - Class Identifiers
 * 
 * classes.js defines the numeric identifiers for all playable character classes.
 * These constants are used throughout the mod to identify and handle class-specific
 * behaviors, skills, and mechanics.
 */

// -------------------------------------------------------------------------
// Character Class Constants
// -------------------------------------------------------------------------

// Tank classes
const LANCER = 1;
const BRAWLER = 10;   // also known as Fighter

// Melee DPS classes
const WARRIOR = 0;
const SLAYER = 2;
const BERSERKER = 3;
const NINJA = 11;     // also known as Assassin
const VALKYRIE = 12;  // also known as Glaiver

// Ranged DPS classes
const SORCERER = 4;
const ARCHER = 5;
const GUNNER = 9;     // also known as Engineer
const REAPER = 8;     // also known as Soulless

// Healer classes
const PRIEST = 6;
const MYSTIC = 7;     // also known as Elementalist

// Export all class constants
module.exports = {
    WARRIOR,
    LANCER,
    SLAYER,
    BERSERKER,
    SORCERER,
    ARCHER,
    PRIEST,
    MYSTIC,
    REAPER,
    GUNNER,
    BRAWLER,
    NINJA,
    VALKYRIE
};