'use strict'

const DefaultSettings = {
    enabled: true,
    debug: {
        enabled: false,
        skills: false,
        packets: false,
        abnormals: false,
        ping: false
    },
    ping: {
        timeout: 20000,
        interval: 6000,
        samples: 20
    },
    skills: {
        enabled: true,
        retryCount: 2,
        retryMs: 25,
        retryJittercomp: 15,
        serverTimeout: 200,
        forceClipStrict: true,
        defendSuccessStrict: true,
        delayOnFail: true,
        jitterCompensation: true,
        chargeJitterMax: 50
    },
    emulation: {
        enableInstantSkills: true,
        enableInstantChains: true,
        enablePredictiveRetries: true
    },
    packets: {
        queueThrottleTime: 25,
        maxQueueSize: 30
    }
}

module.exports = function MigrateSettings(from_ver, to_ver, settings) {
    if (from_ver === undefined) {
        // Migrate legacy config file
        return Object.assign(Object.assign({}, DefaultSettings), settings)
    } else if (from_ver === null) {
        // No config file exists, use default settings
        return DefaultSettings
    } else {
        // Migrate from older version (using the new system)
        if (from_ver + 1 < to_ver) {
            // Recursively upgrade in one-version steps
            settings = MigrateSettings(from_ver, from_ver + 1, settings)
            return MigrateSettings(from_ver + 1, to_ver, settings)
        }

        // If we reach this point, then we're handling a one-version upgrade
        // In this case, we can assume that from_ver === to_ver - 1
        switch (to_ver) {
            case 2:
                // Upgrade from version 1 to version 2
                // Add any new settings or modify existing ones here
                break
        }

        return settings
    }
}