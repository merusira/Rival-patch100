/*
 * Rival Mod - Player System
 *
 * player.js manages player state, attributes, and movement tracking.
 * It provides methods to query player information, track inventory, party members,
 * and monitor player status changes through packet hooks.
 */

// Default hook settings for packet handlers
const DEFAULT_HOOK_SETTINGS = {order: -1001, filter: {fake: null}};
// Base attack speeds for different classes
const BASE_CLASS_SPEEDS = {
    0: 120, // Warrior
    1: 100, // Lancer
    2: 110, // Slayer
    3: 90,  // Berserker
    4: 110, // Sorcerer
    5: 120, // Archer
    6: 105, // Priest
    7: 105, // Mystic
    8: 105, // Reaper
    9: 90,  // Gunner
    10: 90, // Brawler
    11: 100, // Ninja
    12: 100, // Valkyrie
};

/*
 * Player class
 *
 * Tracks and manages player state including position, stats, inventory,
 * party information, and status effects. Provides methods to query player
 * information and monitor changes through packet hooks.
 */
class Player{
    /*
     * Creates a new Player instance
     * @param {Object} dispatch - The dispatch interface for hooking events and sending packets
     * @param {Object} mods - Collection of module references
     */
    constructor(dispatch, mods) {
        this.dispatch = dispatch;    // Dispatch interface
        this.mods = mods;            // Module references
        
        // Player identification
        this.gameId = null;          // Player's game ID
        this.templateId = null;      // Player's template ID
        this.serverId = null;        // Player's server ID
        this.playerId = null;        // Player's player ID
        this.name = null;            // Player's name
        this.race = null;            // Player's race
        this.job = null;             // Player's job/class
        this.level = null;           // Player's level
        this.classChangeLevel = null; // Player's class change level
        
        // Player status
        this.onMount = false;        // Whether player is mounted
        this.alive = true;           // Whether player is alive
        this.moving = false;         // Whether player is moving
        this.onPegasus = false;      // Whether player is on pegasus
        this.inCombat = false;       // Whether player is in combat
        
        // Player resources
        this.stamina = 0;            // Player's stamina
        this.health = 0;             // Player's current HP
        this.maxHealth = 0;          // Player's maximum HP
        this.mana = 0;               // Player's current MP
        this.maxMana = 0;            // Player's maximum MP
        this.gold = 0;               // Player's gold
        
        // Player stats
        this.attackSpeed = 0;        // Base attack speed
        this.attackSpeedBonus = 0;   // Attack speed bonus
        this.aspdDivider = 0;        // Attack speed divider
        this.aspd = 0;               // Calculated attack speed
        
        // Movement speed
        this.msWalk = 0;             // Walk speed with bonus
        this.msWalkBase = 0;         // Base walk speed
        this.msWalkBonus = 0;        // Walk speed bonus
        this.msRun = 0;              // Run speed with bonus
        this.msRunBase = 0;          // Base run speed
        this.msRunBonus = 0;         // Run speed bonus
        
        // Sorcerer edge
        this.fireEdge = 0;           // Fire edge count
        this.iceEdge = 0;            // Ice edge count
        this.lightningEdge = 0;      // Lightning edge count
        
        // Location
        this.loc = {x: 0, y: 0, z: 0, w: 0, updated: 0}; // Player location
        this.pos = {x: 0, y: 0, z: 0, w: 0, updated: 0}; // Alias for location
        this.zone = -1;              // Current zone ID
        this.channel = 0;            // Current channel
        
        // Inventory
        this.inven = {
            weapon: false,           // Whether player has weapon equipped
            effects: [],             // Armor effects
            items: {},               // Item storage
            slots: 0                 // Inventory slot count
        };
        this.inventoryBuffer = {};   // Buffer for inventory updates
        
        // Party information
        this.playersInParty = new Map(); // Map of players in party
        this.unsetPlayersInParty = [];   // Players in party without gameId
        this.partyLeader = false;        // Whether player is party leader
        
        // State tracking
        this.previous_sPlayerStatUpdate = null; // Previous stat update
        this.hooksInitialized = false;          // Whether hooks are initialized
        
        // Initialize hooks if possible
        this.initializeHooks();
    }
    
    // Method to initialize hooks when packet module is available
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

        /*
         * Checks if a game ID belongs to the player
         * @param {BigInt} id - The game ID to check
         * @returns {boolean} Whether the ID belongs to the player
         */
        this.isMe = (id) => {
            return id == this.gameId;
        }

        /*
         * Handles player login events
         * @param {Object} e - The login event data
         */
        this.sLogin = (e) => {
            // Reset status flags
            this.onPegasus = false;
            this.inCombat = false;
            
            // Set player identification
            this.gameId = e.gameId;
            this.templateId = e.templateId;
            this.serverId = e.serverId;
            this.playerId = e.playerId;
            this.name = e.name;
            
            // Calculate race and job from template ID
            this.race = Math.floor((e.templateId - 10101) / 100);
            this.job = (e.templateId - 10101) % 100;
            
            // Set player level information
            this.level = e.level;
            this.classChangeLevel = e.classChangeLevel;
        }
        try {
            const loginPacket = mods.packet.get_all("S_LOGIN");
            if (loginPacket && loginPacket[1] !== null) {
                dispatch.hook(...loginPacket, DEFAULT_HOOK_SETTINGS, this.sLogin);
            }
        } catch(e) {
            // Silently handle error
        }

        // Level up
        try {
            const levelupPacket = mods.packet.get_all("S_USER_LEVELUP");
            if (levelupPacket && levelupPacket[1] !== null) {
                dispatch.hook(...levelupPacket, e=> {
                    if(this.isMe(e.gameId)) this.level = e.level;
                });
            }
        } catch(e) {
            // Silently handle error
        }

        /*
         * Handles player stat update events
         * @param {Object} e - The stat update event data
         */
        this.sPlayerStatUpdate = (e) => {
            // Store the full update for reference
            this.previous_sPlayerStatUpdate = e;
            
            // Update player resources
            this.stamina = e.stamina;
            this.health = e.hp;
            this.maxHealth = e.maxHp;
            this.mana = e.mp;
            this.maxMana = e.maxMp;
            
            // Calculate attack speed values
            this.attackSpeed = e.attackSpeed;
            this.attackSpeedBonus = e.attackSpeedBonus;
            const multiplier = e.attackSpeed / BASE_CLASS_SPEEDS[this.job];
            this.aspdDivider = (this.job >= 8 ? 100 : (e.attackSpeed / multiplier));
            this.aspd = (e.attackSpeed + e.attackSpeedBonus) / this.aspdDivider;
            
            // Update movement speed values
            this.msWalk = e.walkSpeed + e.walkSpeedBonus;
            this.msWalkBase = e.walkSpeed;
            this.msWalkBonus = e.walkSpeedBonus;
            this.msRun = e.runSpeed + e.runSpeedBonus;
            this.msRunBase = e.runSpeed;
            this.msRunBonus = e.runSpeedBonus;

            // Update sorcerer edge counters
            this.fireEdge = e.fireEdge;
            this.iceEdge = e.iceEdge;
            this.lightningEdge = e.lightningEdge;
        }
        try {
            const statUpdatePacket = mods.packet.get_all("S_PLAYER_STAT_UPDATE");
            if (statUpdatePacket && statUpdatePacket[1] !== null) {
                dispatch.hook(...statUpdatePacket, DEFAULT_HOOK_SETTINGS, this.sPlayerStatUpdate);
            }
        } catch(e) {
            // Silently handle error
        }

        // Channel/zone information
        try {
            const channelPacket = mods.packet.get_all("S_CURRENT_CHANNEL");
            if (channelPacket && channelPacket[1] !== null) {
                dispatch.hook(...channelPacket, e=> {
                    this.channel = e.channel - 1;
                    this.zone = e.zone;
                });
            }
        } catch(e) {
            // Silently handle error
        }

        /*
         * Handles player stamina change events
         * @param {Object} e - The stamina change event data
         */
        this.sPlayerChangeStamina = (e) => {
            this.stamina = e.current;
        }
        try {
            const staminaPacket = mods.packet.get_all("S_PLAYER_CHANGE_STAMINA");
            if (staminaPacket && staminaPacket[1] !== null) {
                dispatch.hook(...staminaPacket, DEFAULT_HOOK_SETTINGS, this.sPlayerChangeStamina);
            }
        } catch(e) {
            // Silently handle error
        }

        /*
         * Handles player health change events
         * @param {Object} e - The health change event data
         */
        this.sCreatureChangeHp = e => {
            if(!this.isMe(e.target)) return;
            this.health = e.curHp;
            this.maxHealth = e.maxHp;
        }
        try {
            const hpPacket = mods.packet.get_all("S_CREATURE_CHANGE_HP");
            if (hpPacket && hpPacket[1] !== null) {
                dispatch.hook(...hpPacket, DEFAULT_HOOK_SETTINGS, this.sCreatureChangeHp);
            }
        } catch(e) {
            // Silently handle error
        }

        /*
         * Handles player mana change events
         * @param {Object} e - The mana change event data
         */
        this.sPlayerChangeMp = e => {
            if(!this.isMe(e.target)) return;
            this.mana = e.currentMp;
            this.maxMana = e.maxMp;
        }
        try {
            const mpPacket = mods.packet.get_all("S_PLAYER_CHANGE_MP");
            if (mpPacket && mpPacket[1] !== null) {
                dispatch.hook(...mpPacket, DEFAULT_HOOK_SETTINGS, this.sPlayerChangeMp);
            }
        } catch(e) {
            // Silently handle error
        }

        /*
         * Handles zone change events
         * @param {Object} e - The zone change event data
         */
        this.sLoadTopo = (e) => {
            this.onMount = false;  // Reset mount status on zone change
            this.zone = e.zone;    // Update current zone
        }
        try {
            const topoPacket = mods.packet.get_all("S_LOAD_TOPO");
            if (topoPacket && topoPacket[1] !== null) {
                dispatch.hook(...topoPacket, DEFAULT_HOOK_SETTINGS, this.sLoadTopo);
            }
        } catch(e) {
            // Silently handle error
        }

        /*
         * Handles mount/unmount events
         * @param {boolean} onMount - Whether this is a mount (true) or unmount (false) event
         * @param {Object} e - The mount/unmount event data
         */
        this.sMount = (onMount, e) => {
            if(this.isMe(e.gameId)) this.onMount = onMount;
        }
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

        /*
         * Handles party member list updates
         * @param {Object} e - The party member list event data
         */
        this.sPartyMemberList = (e) => {
            // Reset party member tracking
            this.unsetPlayersInParty = [];
            this.playersInParty.clear();

            // Check if player is the party leader
            this.partyLeader = e.leader.serverId === this.serverId && e.leader.playerId == this.playerId;
            
            // Process each party member
   for(let member of e.members){
    // Skip self in the party list
    if(!this.isMe(member.gameId)) {
                    if(member.gameId) this.playersInParty.set(member.gameId, member);
                    else {
                        let found = false;
                        for(const [gameId, {serverId, playerId}] of Object.entries(mods.entity.players)) {
                            if(serverId === member.serverId && playerId === member.playerId) {
                                found = true;
                                this.playersInParty.set(BigInt(gameId), member);
                                break;
                            }
                        }
                        if(found) continue;

                        this.unsetPlayersInParty.push(member);
                    }
                }
			}
        }
        try {
            const partyListPacket = mods.packet.get_all("S_PARTY_MEMBER_LIST");
            if (partyListPacket && partyListPacket[1] !== null) {
                dispatch.hook(...partyListPacket, this.sPartyMemberList);
            }
        } catch(e) {
            // Silently handle error
        }

        /*
         * Handles party member stat updates
         * @param {Object} e - The party member stat update event data
         */
        this.sPartyMemberStatUpdate = (e) => {
            // Update stats for the matching party member
            this.playersInParty.forEach((gameId, member)=> {
                // Skip if this update isn't for this member
                if(e.serverId !== member.serverId || e.playerId !== member.playerId) return;
                
                // Update member data with new stats
                this.playersInParty.set(gameId, { ...member, ...e });
            });
        }
        try {
            const partyStatPacket = mods.packet.get_all("S_PARTY_MEMBER_STAT_UPDATE");
            if (partyStatPacket && partyStatPacket[1] !== null) {
                dispatch.hook(...partyStatPacket, this.sPartyMemberStatUpdate);
            }
        } catch(e) {
            // Silently handle error
        }

        /*
         * Handles user spawn events to match with party members
         * @param {Object} e - The user spawn event data
         */
        this.sSpawnUser = (e) => {
            // Skip if no unset party members to process
            if(!this.unsetPlayersInParty.length) return;

            // Try to match spawned user with unset party members
            for(const idx in this.unsetPlayersInParty) {
                const { serverId, playerId } = this.unsetPlayersInParty[idx];
                
                // Skip if this spawn doesn't match this unset party member
                if(serverId !== e.serverId || playerId !== e.playerId) continue;

                // Found a match - add to party members with gameId and remove from unset list
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

        /*
         * Handles party leave events
         * @param {Object} e - The leave party event data
         */
        this.sLeaveParty = (e) => {
            // Clear all party member tracking when leaving a party
            this.unsetPlayersInParty = [];
            this.playersInParty.clear();
        }
        try {
            dispatch.hook('S_LEAVE_PARTY', 'raw', this.sLeaveParty);
        } catch(e) {
            // Silently handle error
        }

        /*
         * Handles player spawn events
         * @param {Object} e - The player spawn event data
         */
        this.sSpawnMe = (e) => {
            // Set player as alive when spawned
            this.alive = true;
        }
        try {
            dispatch.hook('S_SPAWN_ME', 'raw', DEFAULT_HOOK_SETTINGS, this.sSpawnMe);
        } catch(e) {
            // Silently handle error
        }

        /*
         * Handles creature life status events
         * @param {Object} e - The creature life event data
         */
        this.sCreatureLife = (e) => {
            // Only process if this is for the player
            if(this.isMe(e.gameId)) {
                // Update alive status
                this.alive = e.alive;
                // Update location if provided
                Object.assign(this.loc, e.loc);
            }
        }
        try {
            const lifePacket = mods.packet.get_all("S_CREATURE_LIFE");
            if (lifePacket && lifePacket[1] !== null) {
                dispatch.hook(...lifePacket, DEFAULT_HOOK_SETTINGS, this.sCreatureLife);
            }
        } catch(e) {
            // Silently handle error
        }

        // Inventory handling
        // Note: This section handles different inventory packet formats based on game version
        if(dispatch.majorPatchVersion >= 85) {
            const pocketSizes = {};
            
            /*
             * Handles inventory updates for modern game versions (85+)
             * @param {Object} e - The inventory event data
             */
            this.sInven = (e) => {
                try {
                    if(!this.isMe(e.gameId)) return;
                    
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
        
                    if(!e.more) {
                        try {
                            switch(e.container) {
                                // inven
                                case 0: {
                                    this.inven.slots = 0;
                                    this.inven.items = {};
    
                                    for(const pocket in this.inventoryBuffer) {
                                        this.inven.slots += pocketSizes[pocket] || 0;
    
                                        if (Array.isArray(this.inventoryBuffer[pocket])) {
                                            for(const item of this.inventoryBuffer[pocket]) {
                                                if (!item || typeof item !== 'object') continue;
                                                
                                                if(!this.inven.items[item.id]) this.inven.items[item.id] = [];
                                                this.inven.items[item.id].push(Object.assign({}, item, {
                                                    itemId: item.id
                                                }));
                                            }
                                        }
                                    }
                                    break;
                                }
    
                                // equip
                                case 14: {
                                    this.inven.weapon = false;
                                    this.inven.effects = [];
                                    
                                    if (Array.isArray(this.inventoryBuffer[0])) {
                                        for(const item of (this.inventoryBuffer[0] || [])) {
                                            if (!item || typeof item !== 'object') continue;
                                            
                                            switch(item.slot) {
                                                case 1: {
                                                    this.inven.weapon = true;
                                                    break;
                                                }
                                                case 3: {
                                                    try {
                                                        if (!item.passivitySets) break;
                                                        
                                                        let activeSet = item.passivitySets[item.passivitySet];
                                                        if(!activeSet) activeSet = item.passivitySets[0];
                                                        if(!activeSet) break;
    
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
            let hooked = false;
            try {
                const itemlistPacket = mods.packet.get_all("S_ITEMLIST");
                if (itemlistPacket && itemlistPacket[1] !== null) {
                    dispatch.hook(...itemlistPacket, DEFAULT_HOOK_SETTINGS, this.sInven);
                    hooked = true;
                }
            } catch(e) {
                // Silently handle error
            }
            
            // If we couldn't hook with the packet module, try direct versions
            if (!hooked) {
                // Try multiple versions, starting with the most likely ones
                const versionsToTry = [4, 5, 6, 7, 3];
                
                for (const version of versionsToTry) {
                    try {
                        dispatch.hook('S_ITEMLIST', version, DEFAULT_HOOK_SETTINGS, this.sInven);
                        hooked = true;
                        break;
                    } catch (e) {
                        // Continue to next version
                    }
                }
            }
        }else {
            /*
             * Handles inventory updates for legacy game versions (pre-85)
             * @param {Object} e - The inventory event data
             */
            this.sInven = (e) => {
                if(!this.isMe(e.gameId)) return;

                this.inventoryBuffer = e.first ? e.items : this.inventoryBuffer.concat(e.items || []);
                this.gold = e.gold;
    
                if(!e.more) {
                    this.inven.weapon = false;
                    this.inven.effects = [];
                    this.inven.items = {};
    
                    for(let item of this.inventoryBuffer) {
                        if(!this.inven.items[item.id]) this.inven.items[item.id] = [];
                        this.inven.items[item.id].push(Object.assign(item, {
                            itemId: item.id
                        }));
                        
                        switch(item.slot) {
                            case 1:
                                this.inven.weapon = true;
                                break;
                            case 3:
                                // Use try/catch for armor passivity handling to prevent errors
                                let activeSet = [];
    
                                activeSet = item.passivitySets[item.passivitySet];
                                if(!activeSet)
                                    activeSet = item.passivitySets[0];
    
                                try {
                                    for (const effect of activeSet.passivities) {
                                        this.inven.effects.push(Number(effect.id));
                                    }
                                }catch(e) {this.inven.effects = [];}
    
                                break;
                        }
                    }
    
                    this.inventoryBuffer = [];
                }
            };
            
            // Try to hook S_INVEN with multiple versions
            let hooked = false;
            
            // First try to use the packet module if available
            if (mods.packet && typeof mods.packet.get_all === 'function') {
                try {
                    const packetInfo = mods.packet.get_all("S_INVEN");
                    if (packetInfo && packetInfo[1] !== null) {
                        dispatch.hook(...packetInfo, DEFAULT_HOOK_SETTINGS, this.sInven);
                        hooked = true;
                    }
                } catch (e) {
                    // Silently handle error
                }
            }
            
            // If we couldn't hook with the packet module, try direct versions
            if (!hooked) {
                // Try multiple versions, starting with the most likely ones
                const versionsToTry = [15, 14, 13, 17, 16, 18, 12, 11, 10];
                
                for (const version of versionsToTry) {
                    try {
                        dispatch.hook('S_INVEN', version, DEFAULT_HOOK_SETTINGS, this.sInven);
                        hooked = true;
                        break;
                    } catch (e) {
                        // Continue to next version
                    }
                }
                
                if (!hooked) {
                    // Set up minimal inventory state to prevent errors
                    this.inven = {
                        weapon: false,
                        effects: [],
                        items: {},
                        slots: 0
                    };
                }
            }
        }

        // Pegasus
        try {
            const statusPacket = mods.packet.get_all("S_USER_STATUS");
            if (statusPacket && statusPacket[1] !== null) {
                dispatch.hook(...statusPacket, e=> {
                    if(this.isMe(e.gameId)) {
                        this.onPegasus = (e.status === 3);
                        this.inCombat = e.status === 1;
                    }
                });
            }
        } catch(e) {
            // Silently handle error
        }

        // Player moving
        try {
            const locationPacket = mods.packet.get_all("C_PLAYER_LOCATION");
            if (locationPacket && locationPacket[1] !== null) {
                dispatch.hook(...locationPacket, DEFAULT_HOOK_SETTINGS, e=> {
                    this.moving = e.type !== 7;
                });
            }
        } catch(e) {
            // Silently handle error
        }

        /*
         * Updates player location based on movement packets
         * @param {boolean} serverPacket - Whether this is a server packet
         * @param {Object} e - The movement event data
         */
        this.handleMovement = (serverPacket, e) => {
            // For server packets, only process if it's for this player
            // For client packets, always process (client only sends packets for itself)
            if (serverPacket ? e.gameId == this.gameId : true) {
                // Create location object from event
                let loc = e.loc;
                
                // Preserve heading if not provided in the packet
                loc.w = (e.w === undefined ? this.loc.w : e.w);
                
                // Add timestamp for tracking when position was last updated
                loc.updated = Date.now();
                
                // Update both location references
                this.loc = loc;
                this.pos = loc; // pos is an alias for loc
            }
        }
        
        // Hook movement packets
        this.hookMovementPackets();
    }
    
    /*
     * Sets up hooks for player movement packets
     * Tracks player position changes from both server and client packets
     */
    hookMovementPackets() {
        const dispatch = this.dispatch;
        const mods = this.mods;
        
        // Make sure mods and packet module are available
        if (!mods || !mods.packet || typeof mods.packet.get_all !== 'function') {
            return;
        }
        
        /*
         * Helper function to safely hook a packet
         * @param {string} packetName - The packet name to hook
         * @param {boolean} isServerPacket - Whether this is a server packet
         * @param {Object} settings - Hook settings
         */
        const safeHook = (packetName, isServerPacket, settings = {filter: {fake: null}, order: isServerPacket ? 10000 : -10000}) => {
            try {
                const packetInfo = mods.packet.get_all(packetName);
                if (packetInfo && packetInfo[1] !== null) {
                    dispatch.hook(...packetInfo, settings, this.handleMovement.bind(null, isServerPacket));
                }
            } catch(error) {
                // Silently handle error
            }
        };
        
        // Hook server-side movement packets
        safeHook("S_ACTION_STAGE", true);
        safeHook("S_ACTION_END", true);
        
        // Hook client-side movement packets
        safeHook("C_PLAYER_LOCATION", false);
        safeHook("C_NOTIFY_LOCATION_IN_ACTION", false);
        safeHook("C_NOTIFY_LOCATION_IN_DASH", false);
        
        // Hook skill packets that may contain movement data
        safeHook("C_START_SKILL", false);
        safeHook("C_START_TARGETED_SKILL", false);
        safeHook("C_START_COMBO_INSTANT_SKILL", false);
        safeHook("C_START_INSTANCE_SKILL", false);
        safeHook("C_START_INSTANCE_SKILL_EX", false);
        safeHook("C_PRESS_SKILL", false);
    }
}
// Export the Player class
module.exports = Player;