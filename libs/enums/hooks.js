/*
 * Rival Mod - Event Hook System
 * 
 * hooks.js defines the hook configuration constants for the event processing pipeline.
 * It provides a structured set of hook definitions with specific execution priorities
 * and filtering capabilities to control how events are processed throughout the mod.
 */

// -------------------------------------------------------------------------
// Early Stage Hooks (Priority -100)
// These hooks execute first in the pipeline for initial data reading
// -------------------------------------------------------------------------
/*
 * Processes only real (non-fake) events at the earliest stage
 * Used for initial reading of authentic game events
 */
const READ_REAL = {
    order: -100  // Highest priority, executes first
};

/*
 * Processes both real and fake events at the earliest stage
 * Used for initial reading of all event types
 */
const READ_ALL = {
    order: -100,  // Highest priority, executes first
    filter: {
        fake: null  // null filter means process both real and fake events
    }
};

// -------------------------------------------------------------------------
// Internal Modification Hooks (Priority -10)
// These hooks execute after initial reading for internal modifications
// -------------------------------------------------------------------------
/*
 * Processes only fake events for internal modifications
 * Used for modifying synthetic events before standard processing
 */
const MODIFY_INTERNAL_FAKE = {
    order: -10,  // High priority
    filter: {
        fake: true  // Only process fake events
    }
};

/*
 * Processes only real events for internal modifications
 * Used for modifying authentic game events before standard processing
 */
const MODIFY_INTERNAL_REAL = {
    order: -10  // High priority
};

/*
 * Processes both real and fake events for internal modifications
 * Used for modifying all event types before standard processing
 */
const MODIFY_INTERNAL_ALL = {
    order: -10,  // High priority
    filter: {
        fake: null  // Process both real and fake events
    }
};

// -------------------------------------------------------------------------
// Standard Modification Hooks (Priority -5)
// These hooks execute after internal modifications for standard changes
// -------------------------------------------------------------------------
/*
 * Processes only real events for standard modifications
 * Used for typical modifications to authentic game events
 */
const MODIFY_REAL = {
    order: -5  // Medium-high priority
};

/*
 * Processes both real and fake events for standard modifications
 * Used for typical modifications to all event types
 */
const MODIFY_ALL = {
    order: -5,  // Medium-high priority
    filter: {
        fake: null  // Process both real and fake events
    }
};

/*
 * Processes only fake events for standard modifications
 * Used for typical modifications to synthetic events
 */
const MODIFY_FAKE = {
    order: -5,  // Medium-high priority
    filter: {
        fake: true  // Only process fake events
    }
};

// -------------------------------------------------------------------------
// Class-Specific Destination Hooks (Priority 95)
// These hooks execute late in the pipeline for class-specific processing
// -------------------------------------------------------------------------
/*
 * Processes only real events for class-specific destination reading
 * Used for class-specific handling of authentic game events
 */
const READ_DESTINATION_REAL_CLASS = {
    order: 95  // Low priority
};

/*
 * Processes both real and fake events for class-specific destination reading
 * Used for class-specific handling of all event types
 */
const READ_DESTINATION_ALL_CLASS = {
    order: 95,  // Low priority
    filter: {
        fake: null  // Process both real and fake events
    }
};

/*
 * Processes only fake events for class-specific destination reading
 * Used for class-specific handling of synthetic events
 */
const READ_DESTINATION_FAKE_CLASS = {
    order: 100,  // Lowest priority
    filter: {
        fake: true  // Only process fake events
    }
};

// -------------------------------------------------------------------------
// Final Destination Hooks (Priority 100)
// These hooks execute last in the pipeline for final processing
// -------------------------------------------------------------------------
/*
 * Processes only real events for final destination reading
 * Used for final handling of authentic game events
 */
const READ_DESTINATION_REAL = {
    order: 100  // Lowest priority
};

/*
 * Processes both real and fake events for final destination reading
 * Used for final handling of all event types
 */
const READ_DESTINATION_ALL = {
    order: 100,  // Lowest priority
    filter: {
        fake: null  // Process both real and fake events
    }
};

/*
 * Processes only fake events for final destination reading
 * Used for final handling of synthetic events
 */
const READ_DESTINATION_FAKE = {
    order: 100,  // Lowest priority
    filter: {
        fake: true  // Only process fake events
    }
};

// Export all hook configurations
module.exports = {
    // Early reading hooks (highest priority)
    READ_REAL,
    READ_ALL,
    // Internal modification hooks (high priority)
    MODIFY_INTERNAL_FAKE,
    MODIFY_INTERNAL_REAL,
    MODIFY_INTERNAL_ALL,
    // Standard modification hooks (medium priority)
    MODIFY_REAL,
    MODIFY_ALL,
    MODIFY_FAKE,
    // Class-specific destination hooks (low priority)
    READ_DESTINATION_REAL_CLASS,
    READ_DESTINATION_ALL_CLASS,
    READ_DESTINATION_FAKE_CLASS,
    // Final destination hooks (lowest priority)
    READ_DESTINATION_REAL,
    READ_DESTINATION_ALL,
    READ_DESTINATION_FAKE
};