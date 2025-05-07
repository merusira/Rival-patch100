/*
 * Rival Mod - Player System
 * 
 * player.js manages player state, attributes, and movement tracking.
 * It provides a centralized interface for accessing player information
 * and responds to game events that affect the player character.
 */

// Default hook settings for packet handlers
const DEFAULT_HOOK_SETTINGS = {order: -1001, filter: {fake: null}};

// Base attack speed values for each class
const BASE_CLASS_SPEEDS = {
    0: 120,  // Warrior
    1: 100,  // Lancer
    2: 110,  // Slayer
    3: 90,   // Berserker
    4: 110,  // Sorcerer
    5: 120,  // Archer
    6: 105,  // Priest
    7: 105,  // Mystic
    8: 105,  // Reaper
    9: 90,   // Gunner
    10: 90,  // Brawler
    11: 100, // Ninja
    12: 100, // Valkyrie
};

/*
 * Player class
 * 
 * Tracks and manages all player-related information including stats,
 * inventory, location, and party status. Provides methods to access
 * player data and responds to game events.
 */
class Player {
    /*
     * Creates a new Player instance
     * @param {Object} mod - The mod API object for hooking events and sending packets
     * @param {Object} mods - Collection of module references
     */
    constructor(mod, mods) {
        // Store references for later use
        this.dispatch = mod;
        this.mods = mods;
        
        // Player state
        this.onMount = false;        // Whether player is on a mount
        this.alive = true;           // Whether player is alive
        this.inven = {               // Inventory information
            weapon: false,           // Whether player has weapon equipped
            effects: []              // Active armor effects
        };
        this.inventoryBuffer = {};   // Buffer for inventory updates
        
        // Location tracking
        this.loc = {x: 0, y: 0, z: 0, w: 0, updated: 0};  // Current location
        this.pos = {x: 0, y: 0, z: 0, w: 0, updated: 0};  // Alias for location
        this.moving = false;         // Whether player is moving
        
        // Zone and channel information
        this.zone = -1;              // Current zone ID
        this.channel = 0;            // Current channel number
        
        // Party information
        this.playersInParty = new Map();  // Map of players in party
        this.unsetPlayersInParty = [];    // Players not yet mapped to game IDs
        this.partyLeader = false;         // Whether player is party leader
        
        // Status flags
        this.onPegasus = false;      // Whether player is on pegasus
        this.inCombat = false;       // Whether player is in combat
        
        // Initialize hooks
        this.initializeHooks();
    }
    
    /*
     * Initializes all packet hooks for player tracking
     * Called during construction and can be called again if packet module becomes available later
     */
    initializeHooks() {
        // Skip if already initialized
        if (this.hooksInitialized) return;
        this.hooksInitialized = true;
        
        // Make sure mods and packet module are available
        if (!this.mods || !this.mods.packet || typeof this.mods.packet.get_all !== 'function') {
            return;
        }
        
        const dispatch = this.dispatch;
        const mods = this.mods;

        // Set up core player methods
        this._setupCoreMethods();
        
        // Set up hooks for different player systems
        this._setupLoginHooks();
        this._setupStatHooks();
        this._setupZoneHooks();
        this._setupMountHooks();
        this._setupPartyHooks();
        this._setupLifeHooks();
        this._setupInventoryHooks();
        this._setupStatusHooks();
        this._setupMovementHooks();
    }
    
    /*
     * Sets up core player methods
     * @private
     */
    _setupCoreMethods() {
        // Check if an entity is the player
        this.isMe = (arg) => {
            return arg == this.gameId;
        };
    }
    
    /*
     * Sets up hooks for login and level up events
     * @private
     */
    _setupLoginHooks() {
        const dispatch = this.dispatch;
        const mods = this.mods;
        
        // Login handler
        this.sLogin = (e) => {
            this.onPegasus = false;
            this.inCombat = false;
            this.gameId = e.gameId;
            this.templateId = e.templateId;
            this.serverId = e.serverId;
            this.playerId = e.playerId;

            this.race = Math.floor((e.templateId - 10101) / 100);
            this.job = (e.templateId - 10101) % 100;
            this.name = e.name;
            this.level = e.level;
            this.classChangeLevel = e.classChangeLevel;
        };
        
        try {
            const loginPacket = mods.packet.get_all("S_LOGIN");
            if (loginPacket && loginPacket[1] !== null) {
                dispatch.hook(...loginPacket, DEFAULT_HOOK_SETTINGS, this.sLogin);
            }
        } catch(e) {
            // Silently handle error
        }

        // Level up handler
        try {
            const levelupPacket = mods.packet.get_all("S_USER_LEVELUP");
            if (levelupPacket && levelupPacket[1] !== null) {
                dispatch.hook(...levelupPacket, e => {
                    if (this.isMe(e.gameId)) this.level = e.level;
                });
            }
        } catch(e) {
            // Silently handle error
        }
    }
    
    /*
     * Sets up hooks for player stats
     * @private
     */
    _setupStatHooks() {
        const dispatch = this.dispatch;
        const mods = this.mods;
        
        // Player stat update handler
        this.sPlayerStatUpdate = (e) => {
            this.previous_sPlayerStatUpdate = e;
            this.stamina = e.stamina;
            this.health = e.hp;
            this.maxHealth = e.maxHp;
            this.mana = e.mp;
            this.maxMana = e.maxMp;
            
            // Attack speed calculations
            this.attackSpeed = e.attackSpeed;
            this.attackSpeedBonus = e.attackSpeedBonus;
            const multiplier = e.attackSpeed / BASE_CLASS_SPEEDS[this.job];
            this.aspdDivider = (this.job >= 8 ? 100 : (e.attackSpeed / multiplier));
            this.aspd = (e.attackSpeed + e.attackSpeedBonus) / this.aspdDivider;
            
            // Movement speed
            this.msWalk = e.walkSpeed + e.walkSpeedBonus;
            this.msWalkBase = e.walkSpeed;
            this.msWalkBonus = e.walkSpeedBonus;
            this.msRun = e.runSpeed + e.runSpeedBonus;
            this.msRunBase = e.runSpeed;
            this.msRunBonus = e.runSpeedBonus;

            // Class-specific resources
            this.fireEdge = e.fireEdge;
            this.iceEdge = e.iceEdge;
            this.lightningEdge = e.lightningEdge;
        };
        
        try {
            const statUpdatePacket = mods.packet.get_all("S_PLAYER_STAT_UPDATE");
            if (statUpdatePacket && statUpdatePacket[1] !== null) {
                dispatch.hook(...statUpdatePacket, DEFAULT_HOOK_SETTINGS, this.sPlayerStatUpdate);
            }
        } catch(e) {
            // Silently handle error
        }

        // Stamina update handler
        this.sPlayerChangeStamina = (e) => {
            this.stamina = e.current;
        };
        
        try {
            const staminaPacket = mods.packet.get_all("S_PLAYER_CHANGE_STAMINA");
            if (staminaPacket && staminaPacket[1] !== null) {
                dispatch.hook(...staminaPacket, DEFAULT_HOOK_SETTINGS, this.sPlayerChangeStamina);
            }
        } catch(e) {
            // Silently handle error
        }

        // Health update handler
        this.sCreatureChangeHp = e => {
            if (!this.isMe(e.target)) return;
            this.health = e.curHp;
            this.maxHealth = e.maxHp;
        };
        
        try {
            const hpPacket = mods.packet.get_all("S_CREATURE_CHANGE_HP");
            if (hpPacket && hpPacket[1] !== null) {
                dispatch.hook(...hpPacket, DEFAULT_HOOK_SETTINGS, this.sCreatureChangeHp);
            }
        } catch(e) {
            // Silently handle error
        }

        // Mana update handler
        this.sPlayerChangeMp = e => {
            if (!this.isMe(e.target)) return;
            this.mana = e.currentMp;
            this.maxMana = e.maxMp;
        };
        
        try {
            const mpPacket = mods.packet.get_all("S_PLAYER_CHANGE_MP");
            if (mpPacket && mpPacket[1] !== null) {
                dispatch.hook(...mpPacket, DEFAULT_HOOK_SETTINGS, this.sPlayerChangeMp);
            }
        } catch(e) {
            // Silently handle error
        }
    }
    
    /*
     * Sets up hooks for zone and channel information
     * @private
     */
    _setupZoneHooks() {
        const dispatch = this.dispatch;
        const mods = this.mods;
        
        try {
            const channelPacket = mods.packet.get_all("S_CURRENT_CHANNEL");
            if (channelPacket && channelPacket[1] !== null) {
                dispatch.hook(...channelPacket, e => {
                    this.channel = e.channel - 1;
                    this.zone = e.zone;
                });
            }
        } catch(e) {
            // Silently handle error
        }
    }
    
    /*
     * Sets up hooks for mount status
     * @private
     */
    _setupMountHooks() {
        const dispatch = this.dispatch;
        const mods = this.mods;
        
        // Load topo handler (resets mount status)
        this.sLoadTopo = (e) => {
            this.onMount = false;
            this.zone = e.zone;
        };
        
        try {
            const topoPacket = mods.packet.get_all("S_LOAD_TOPO");
            if (topoPacket && topoPacket[1] !== null) {
                dispatch.hook(...topoPacket, DEFAULT_HOOK_SETTINGS, this.sLoadTopo);
            }
        } catch(e) {
            // Silently handle error
        }

        // Mount/unmount handler
        this.sMount = (onMount, e) => {
            if (this.isMe(e.gameId)) this.onMount = onMount;
        };
        
        try {
            const mountPacket = mods.packet.get_all("S_MOUNT_VEHICLE");
            if (mountPacket && mountPacket[1] !== null) {
                dispatch.hook(...mountPacket, DEFAULT_HOOK_SETTINGS, this.sMount.bind(null, true));
            }
        } catch(e) {
            // Silently handle error
        }
        
        try {
            const unmountPacket = mods.packet.get_all("S_UNMOUNT_VEHICLE");
            if (unmountPacket && unmountPacket[1] !== null) {
                dispatch.hook(...unmountPacket, DEFAULT_HOOK_SETTINGS, this.sMount.bind(null, false));
            }
        } catch(e) {
            // Silently handle error
        }
    }
    
    /*
     * Sets up hooks for party information
     * @private
     */
    _setupPartyHooks() {
        const dispatch = this.dispatch;
        const mods = this.mods;
        
        // Party member list handler
        this.sPartyMemberList = (e) => {
            this.unsetPlayersInParty = [];
            this.playersInParty.clear();

            this.partyLeader = e.leader.serverId === this.serverId && e.leader.playerId == this.playerId;
            
            for (let member of e.members) {
                // Skip self
                if (this.isMe(member.gameId)) continue;
                
                // If we have the gameId, add directly to the map
                if (member.gameId) {
                    this.playersInParty.set(member.gameId, member);
                } else {
                    // Try to find the gameId from entity module
                    let found = false;
                    for (const [gameId, {serverId, playerId}] of Object.entries(mods.entity.players)) {
                        if (serverId === member.serverId && playerId === member.playerId) {
                            found = true;
                            this.playersInParty.set(BigInt(gameId), member);
                            break;
                        }
                    }
                    
                    // If not found, add to unset list for later resolution
                    if (!found) {
                        this.unsetPlayersInParty.push(member);
                    }
                }
            }
        };
        
        try {
            const partyListPacket = mods.packet.get_all("S_PARTY_MEMBER_LIST");
            if (partyListPacket && partyListPacket[1] !== null) {
                dispatch.hook(...partyListPacket, this.sPartyMemberList);
            }
        } catch(e) {
            // Silently handle error
        }

        // Party member stat update handler
        this.sPartyMemberStatUpdate = (e) => {
            this.playersInParty.forEach((member, gameId) => {
                if (e.serverId !== member.serverId || e.playerId !== member.playerId) return;
                this.playersInParty.set(gameId, { ...member, ...e });
            });
        };
        
        try {
            const partyStatPacket = mods.packet.get_all("S_PARTY_MEMBER_STAT_UPDATE");
            if (partyStatPacket && partyStatPacket[1] !== null) {
                dispatch.hook(...partyStatPacket, this.sPartyMemberStatUpdate);
            }
        } catch(e) {
            // Silently handle error
        }

        // Spawn user handler (resolves unset party members)
        this.sSpawnUser = (e) => {
            if (!this.unsetPlayersInParty.length) return;

            for (const idx in this.unsetPlayersInParty) {
                const { serverId, playerId } = this.unsetPlayersInParty[idx];
                if (serverId !== e.serverId || playerId !== e.playerId) continue;

                this.playersInParty.set(e.gameId, { ...this.unsetPlayersInParty[idx], ...e });
                this.unsetPlayersInParty.splice(this.unsetPlayersInParty.indexOf(this.unsetPlayersInParty[idx]), 1);
                break;
            }
        };
        
        try {
            const spawnUserPacket = mods.packet.get_all("S_SPAWN_USER");
            if (spawnUserPacket && spawnUserPacket[1] !== null) {
                dispatch.hook(...spawnUserPacket, this.sSpawnUser);
            }
        } catch(e) {
            // Silently handle error
        }

        // Leave party handler
        this.sLeaveParty = (e) => {
            this.unsetPlayersInParty = [];
            this.playersInParty.clear();
        };
        
        try {
            dispatch.hook('S_LEAVE_PARTY', 'raw', this.sLeaveParty);
        } catch(e) {
            // Silently handle error
        }
    }
    
    /*
     * Sets up hooks for player life status
     * @private
     */
    _setupLifeHooks() {
        const dispatch = this.dispatch;
        const mods = this.mods;
        
        // Spawn handler
        this.sSpawnMe = (e) => {
            this.alive = true;
        };
        
        try {
            dispatch.hook('S_SPAWN_ME', 'raw', DEFAULT_HOOK_SETTINGS, this.sSpawnMe);
        } catch(e) {
            // Silently handle error
        }

        // Life status handler
        this.sCreatureLife = (e) => {
            if (this.isMe(e.gameId)) {
                this.alive = e.alive;
                Object.assign(this.loc, e.loc);
            }
        };
        
        try {
            const lifePacket = mods.packet.get_all("S_CREATURE_LIFE");
            if (lifePacket && lifePacket[1] !== null) {
                dispatch.hook(...lifePacket, DEFAULT_HOOK_SETTINGS, this.sCreatureLife);
            }
        } catch(e) {
            // Silently handle error
        }
    }
    
    /*
     * Sets up hooks for inventory tracking
     * @private
     */
    _setupInventoryHooks() {
        const dispatch = this.dispatch;
        const mods = this.mods;
        
        // Use different inventory handlers based on patch version
        if (dispatch.majorPatchVersion >= 85) {
            this._setupModernInventoryHooks();
        } else {
            this._setupLegacyInventoryHooks();
        }
    }
    
    /*
     * Sets up inventory hooks for patch 85+
     * @private
     */
    _setupModernInventoryHooks() {
        const dispatch = this.dispatch;
        const mods = this.mods;
        const pocketSizes = {};
        
        // Modern inventory handler
        this.sInven = (e) => {
            try {
                if (!this.isMe(e.gameId)) return;
                
                // Initialize this.inventoryBuffer[e.pocket] if it doesn't exist
                if (!this.inventoryBuffer[e.pocket]) {
                    this.inventoryBuffer[e.pocket] = [];
                }
                
                // Safely handle items concatenation
                try {
                    this.inventoryBuffer[e.pocket] = e.first ? e.items : this.inventoryBuffer[e.pocket].concat(e.items || []);
                } catch (err) {
                    this.inventoryBuffer[e.pocket] = e.items || [];
                }
                
                pocketSizes[e.pocket] = e.size;
                this.gold = e.money;
    
                if (!e.more) {
                    try {
                        switch (e.container) {
                            // Regular inventory
                            case 0: {
                                this.inven.slots = 0;
                                this.inven.items = {};

                                for (const pocket in this.inventoryBuffer) {
                                    this.inven.slots += pocketSizes[pocket] || 0;

                                    if (Array.isArray(this.inventoryBuffer[pocket])) {
                                        for (const item of this.inventoryBuffer[pocket]) {
                                            if (!item || typeof item !== 'object') continue;
                                            
                                            if (!this.inven.items[item.id]) this.inven.items[item.id] = [];
                                            this.inven.items[item.id].push(Object.assign({}, item, {
                                                itemId: item.id
                                            }));
                                        }
                                    }
                                }
                                break;
                            }

                            // Equipment
                            case 14: {
                                this.inven.weapon = false;
                                this.inven.effects = [];
                                
                                if (Array.isArray(this.inventoryBuffer[0])) {
                                    for (const item of (this.inventoryBuffer[0] || [])) {
                                        if (!item || typeof item !== 'object') continue;
                                        
                                        switch (item.slot) {
                                            // Weapon slot
                                            case 1: {
                                                this.inven.weapon = true;
                                                break;
                                            }
                                            // Armor slot
                                            case 3: {
                                                try {
                                                    if (!item.passivitySets) break;
                                                    
                                                    let activeSet = item.passivitySets[item.passivitySet];
                                                    if (!activeSet) activeSet = item.passivitySets[0];
                                                    if (!activeSet) break;

                                                    this.inven.effects = activeSet.passivities || [];
                                                } catch (err) {
                                                    this.inven.effects = [];
                                                }
                                                break;
                                            }
                                        }
                                    }
                                }
                                break;
                            }
                        }
                    } catch (err) {
                        // Silently handle error
                    }
                    
                    // Reset buffer after processing
                    this.inventoryBuffer = {};
                }
            } catch (err) {
                // Silently handle error
            }
        };
        
        // Try to hook S_ITEMLIST with multiple versions if needed
        this._hookPacketWithFallback("S_ITEMLIST", [4, 5, 6, 7, 3], this.sInven);
    }
    
    /*
     * Sets up inventory hooks for patches before 85
     * @private
     */
    _setupLegacyInventoryHooks() {
        const dispatch = this.dispatch;
        const mods = this.mods;
        
        // Legacy inventory handler
        this.sInven = (e) => {
            if (!this.isMe(e.gameId)) return;

            this.inventoryBuffer = e.first ? e.items : this.inventoryBuffer.concat(e.items || []);
            this.gold = e.gold;

            if (!e.more) {
                this.inven.weapon = false;
                this.inven.effects = [];
                this.inven.items = {};

                for (let item of this.inventoryBuffer) {
                    if (!this.inven.items[item.id]) this.inven.items[item.id] = [];
                    this.inven.items[item.id].push(Object.assign(item, {
                        itemId: item.id
                    }));
                    
                    switch (item.slot) {
                        case 1:
                            this.inven.weapon = true;
                            break;
                        case 3:
                            try {
                                let activeSet = item.passivitySets[item.passivitySet];
                                if (!activeSet) activeSet = item.passivitySets[0];

                                for (const effect of activeSet.passivities) {
                                    this.inven.effects.push(Number(effect.id));
                                }
                            } catch (e) {
                                this.inven.effects = [];
                            }
                            break;
                    }
                }

                this.inventoryBuffer = [];
            }
        };
        
        // Try to hook S_INVEN with multiple versions
        this._hookPacketWithFallback("S_INVEN", [15, 14, 13, 17, 16, 18, 12, 11, 10], this.sInven, () => {
            // Set up minimal inventory state to prevent errors
            this.inven = {
                weapon: false,
                effects: [],
                items: {},
                slots: 0
            };
        });
    }
    
    /*
     * Sets up hooks for player status
     * @private
     */
    _setupStatusHooks() {
        const dispatch = this.dispatch;
        const mods = this.mods;
        
        try {
            const statusPacket = mods.packet.get_all("S_USER_STATUS");
            if (statusPacket && statusPacket[1] !== null) {
                dispatch.hook(...statusPacket, e => {
                    if (this.isMe(e.gameId)) {
                        this.onPegasus = (e.status === 3);
                        this.inCombat = e.status === 1;
                    }
                });
            }
        } catch(e) {
            // Silently handle error
        }
    }
    
    /*
     * Sets up hooks for player movement
     * @private
     */
    _setupMovementHooks() {
        const dispatch = this.dispatch;
        const mods = this.mods;
        
        // Player movement handler
        try {
            const locationPacket = mods.packet.get_all("C_PLAYER_LOCATION");
            if (locationPacket && locationPacket[1] !== null) {
                dispatch.hook(...locationPacket, DEFAULT_HOOK_SETTINGS, e => {
                    this.moving = e.type !== 7;
                });
            }
        } catch(e) {
            // Silently handle error
        }

        // Player location handler
        this.handleMovement = (serverPacket, e) => {
            if (serverPacket ? e.gameId == this.gameId : true) {
                let loc = e.loc;
                loc.w = (e.w === undefined ? this.loc.w : e.w);
                loc.updated = Date.now();

                this.loc = loc;
                this.pos = loc;
            }
        };
        
        // Hook movement packets
        this.hookMovementPackets();
    }
    
    /*
     * Hooks movement-related packets
     */
    hookMovementPackets() {
        const dispatch = this.dispatch;
        const mods = this.mods;
        
        // Make sure mods and packet module are available
        if (!mods || !mods.packet || typeof mods.packet.get_all !== 'function') {
            return;
        }
        
        // Helper function to safely hook a packet
        const safeHook = (packetName, isServerPacket, settings = {filter: {fake: null}, order: isServerPacket ? 10000 : -10000}) => {
            try {
                const packetInfo = mods.packet.get_all(packetName);
                if (packetInfo && packetInfo[1] !== null) {
                    dispatch.hook(...packetInfo, settings, this.handleMovement.bind(null, isServerPacket));
                }
            } catch(e) {
                // Silently handle error
            }
        };
        
        // Hook server packets
        safeHook("S_ACTION_STAGE", true);
        safeHook("S_ACTION_END", true);
        
        // Hook client packets
        safeHook("C_PLAYER_LOCATION", false);
        safeHook("C_NOTIFY_LOCATION_IN_ACTION", false);
        safeHook("C_NOTIFY_LOCATION_IN_DASH", false);
        safeHook("C_START_SKILL", false);
        safeHook("C_START_TARGETED_SKILL", false);
        safeHook("C_START_COMBO_INSTANT_SKILL", false);
        safeHook("C_START_INSTANCE_SKILL", false);
        safeHook("C_START_INSTANCE_SKILL_EX", false);
        safeHook("C_PRESS_SKILL", false);
    }
    
    /*
     * Helper method to hook a packet with fallback versions
     * @param {string} packetName - Name of the packet to hook
     * @param {Array<number>} versions - Array of versions to try
     * @param {Function} handler - Handler function for the packet
     * @param {Function} [fallbackFn] - Function to call if all hook attempts fail
     * @private
     */
    _hookPacketWithFallback(packetName, versions, handler, fallbackFn) {
        const dispatch = this.dispatch;
        const mods = this.mods;
        let hooked = false;
        
        // First try to use the packet module if available
        if (mods.packet && typeof mods.packet.get_all === 'function') {
            try {
                const packetInfo = mods.packet.get_all(packetName);
                if (packetInfo && packetInfo[1] !== null) {
                    dispatch.hook(...packetInfo, DEFAULT_HOOK_SETTINGS, handler);
                    hooked = true;
                }
            } catch (e) {
                // Silently handle error
            }
        }
        
        // If we couldn't hook with the packet module, try direct versions
        if (!hooked) {
            for (const version of versions) {
                try {
                    dispatch.hook(packetName, version, DEFAULT_HOOK_SETTINGS, handler);
                    hooked = true;
                    break;
                } catch (e) {
                    // Continue to next version
                }
            }
            
            // Call fallback function if provided and all hook attempts failed
            if (!hooked && typeof fallbackFn === 'function') {
                fallbackFn();
            }
        }
        
        return hooked;
    }
}
// Export the Player class
module.exports = Player;