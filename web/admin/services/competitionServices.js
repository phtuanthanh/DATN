const { ScoringGamecontrol } = require('../models');

/**
 * Parse date from Air Datepicker format (dd/MM/yyyy HH:mm)
 * @param {string} dateStr - Date string in Air Datepicker format
 * @returns {Date|null} Parsed date or null if invalid
 */
const parseDate = (dateStr) => {
    const parts = dateStr.match(/(\d+)\/(\d+)\/(\d+)\s(\d+):(\d+)/);
    if (!parts) return null;
    return new Date(parts[3], parts[2] - 1, parts[1], parts[4], parts[5]);
};

/**
 * Format date to Flatpickr format (dd/mm/yyyy HH:mm) in Vietnam timezone
 * @param {Date} date - Date to format (in UTC from database)
 * @returns {string} Formatted date string
 */
const formatDateToPicker = (date) => {
    if (!date) return '';
    // Convert from UTC to Vietnam time (UTC+7)
    const VN_TIMEZONE_OFFSET_MS = 7 * 60 * 60 * 1000;
    const vnDate = new Date(new Date(date).getTime() + VN_TIMEZONE_OFFSET_MS);
    const day = String(vnDate.getUTCDate()).padStart(2, '0');
    const month = String(vnDate.getUTCMonth() + 1).padStart(2, '0');
    const year = vnDate.getUTCFullYear();
    const hours = String(vnDate.getUTCHours()).padStart(2, '0');
    const minutes = String(vnDate.getUTCMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
};

/**
 * Format date to readable string (displays Vietnam timezone UTC+7)
 * @param {Date} date - Date to format (in UTC from database)
 * @returns {string} Formatted date string for display in Vietnam time
 */
const formatDateDisplay = (date) => {
    if (!date) return 'Not set';
    // Convert from UTC to Vietnam time (UTC+7)
    const VN_TIMEZONE_OFFSET_MS = 7 * 60 * 60 * 1000;
    const vnDate = new Date(new Date(date).getTime() + VN_TIMEZONE_OFFSET_MS);
    return vnDate.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

/**
 * Validate competition data with strict type checking
 * @param {object} data - Competition data to validate
 * @returns {object} Validation result with valid flag and errors array
 */
const validateCompetitionData = (data) => {
    const errors = [];

    // === REQUIRED FIELDS VALIDATION ===
    if (!data.competition_name || typeof data.competition_name !== 'string' || !data.competition_name.trim()) {
        errors.push('Competition name is required and must be text');
    }

    if (!data.flag_prefix || typeof data.flag_prefix !== 'string' || !data.flag_prefix.trim()) {
        errors.push('Flag prefix is required and must be text');
    }

    if (!data.services_public || typeof data.services_public !== 'string' || !data.services_public.trim()) {
        errors.push('Services Public time is required');
    }

    if (!data.start || typeof data.start !== 'string' || !data.start.trim()) {
        errors.push('Start time is required');
    }

    if (!data.end || typeof data.end !== 'string' || !data.end.trim()) {
        errors.push('End time is required');
    }

    if (data.tick_duration === undefined || data.tick_duration === '') {
        errors.push('Tick duration is required');
    }

    if (data.min_net_number === undefined || data.min_net_number === '') {
        errors.push('Min network number is required');
    }

    if (data.max_net_number === undefined || data.max_net_number === '') {
        errors.push('Max network number is required');
    }

    if (!data.registration_confirm_text || typeof data.registration_confirm_text !== 'string' || !data.registration_confirm_text.trim()) {
        errors.push('Registration confirm text is required and must be text');
    }

    // === TYPE VALIDATION ===

    // Validate tick_duration is an integer
    const tickDuration = parseInt(data.tick_duration);
    if (isNaN(tickDuration) || !Number.isInteger(tickDuration) || tickDuration < 1) {
        errors.push('Tick duration must be a positive integer number');
    }

    // Validate network numbers are integers 0-255
    const minNetNum = parseInt(data.min_net_number);
    const maxNetNum = parseInt(data.max_net_number);

    if (isNaN(minNetNum) || !Number.isInteger(minNetNum) || minNetNum < 0 || minNetNum > 255) {
        errors.push('Min network number must be an integer between 0-255');
    }

    if (isNaN(maxNetNum) || !Number.isInteger(maxNetNum) || maxNetNum < 0 || maxNetNum > 255) {
        errors.push('Max network number must be an integer between 0-255');
    }

    // Validate boolean fields
    if (typeof data.registration_open !== 'boolean' && data.registration_open !== 'true' && data.registration_open !== 'false') {
        errors.push('Registration open must be true or false');
    }

    if (typeof data.cancel_checks !== 'boolean' && data.cancel_checks !== 'true' && data.cancel_checks !== 'false') {
        errors.push('Cancel checks must be true or false');
    }

    if (errors.length > 0) {
        return { valid: false, errors };
    }

    // === DATE VALIDATION ===

    // Parse and validate dates
    const servicesPublicDate = parseDate(data.services_public);
    const startDate = parseDate(data.start);
    const endDate = parseDate(data.end);

    if (!servicesPublicDate || isNaN(servicesPublicDate.getTime())) {
        errors.push('Services Public time is not a valid date');
    }

    if (!startDate || isNaN(startDate.getTime())) {
        errors.push('Start time is not a valid date');
    }

    if (!endDate || isNaN(endDate.getTime())) {
        errors.push('End time is not a valid date');
    }

    if (errors.length > 0) {
        return { valid: false, errors };
    }

    // Validate services_public must be in the future (after now)
    const now = new Date();
    if (servicesPublicDate <= now) {
        errors.push('Services Public time must be in the future (after now)');
    }

    // Validate time ordering: services_public < start < end
    if (servicesPublicDate >= startDate) {
        errors.push('Services Public time must be before Start time');
    }

    if (startDate >= endDate) {
        errors.push('Start time must be before End time');
    }

    // === DURATION & TICK VALIDATION ===

    // Validate tick duration divisibility
    const durationMs = endDate - startDate;
    const durationSeconds = Math.floor(durationMs / 1000);

    if (durationSeconds <= 0) {
        errors.push('Duration must be positive (End time must be after Start time)');
    } else if (durationSeconds % tickDuration !== 0) {
        errors.push(
            `Total duration (${durationSeconds}s) must be exactly divisible by tick duration (${tickDuration}s). ` +
            `Remainder: ${durationSeconds % tickDuration}s`
        );
    }

    // === NETWORK RANGE VALIDATION ===

    if (minNetNum > maxNetNum) {
        errors.push('Min network number cannot be greater than max network number');
    }

    if (errors.length > 0) {
        return { valid: false, errors };
    }

    return { valid: true, errors: [] };
};

/**
 * Calculate valid ticks based on duration and tick duration
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {number} tickDuration - Tick duration in seconds
 * @returns {number} Number of valid ticks
 */
const calculateValidTicks = (startDate, endDate, tickDuration) => {
    const durationMs = endDate - startDate;
    const durationSeconds = Math.floor(durationMs / 1000);
    return Math.floor(durationSeconds / tickDuration);
};

/**
 * Get current competition data formatted for response
 * @returns {object} Competition data or null
 */
const getCurrentCompetition = async () => {
    try {
        const competition = await ScoringGamecontrol.findOne();

        if (!competition) {
            return null;
        }

        return {
            competitionName: competition.competition_name || 'N/A',
            flagPrefix: competition.flag_prefix || 'N/A',
            servicesPublicTime: formatDateDisplay(competition.services_public),
            startTime: formatDateDisplay(competition.start),
            endTime: formatDateDisplay(competition.end),
            currentTick: competition.current_tick || 0,
            validTicks: competition.valid_ticks || 0,
            tickDuration: competition.tick_duration || 0,
            cancelChecks: competition.cancel_checks || false,
            minNetNumber: competition.min_net_number || 0,
            maxNetNumber: competition.max_net_number || 255,
            registrationOpen: competition.registration_open !== false,
            registrationConfirmText: competition.registration_confirm_text || '',
            isActive: competition.start && new Date() >= new Date(competition.start) &&
                (!competition.end || new Date() <= new Date(competition.end))
        };
    } catch (error) {
        const errorMsg = `Failed to fetch current competition: ${error.message || 'Unknown error'}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
    }
};

/**
 * Get competition data formatted for editing (with raw date formats for pickers)
 * @returns {object} Competition data with raw and formatted dates
 */
const getCompetitionForEdit = async () => {
    try {
        const competition = await ScoringGamecontrol.findOne();

        if (!competition) {
            return null;
        }

        return {
            competitionName: competition.competition_name || '',
            flagPrefix: competition.flag_prefix || '',
            servicesPublicTime: formatDateDisplay(competition.services_public),
            servicesPublicRaw: formatDateToPicker(competition.services_public),
            startTime: formatDateDisplay(competition.start),
            startRaw: formatDateToPicker(competition.start),
            endTime: formatDateDisplay(competition.end),
            endRaw: formatDateToPicker(competition.end),
            currentTick: competition.current_tick || 0,
            validTicks: competition.valid_ticks || 0,
            tickDuration: competition.tick_duration || 0,
            cancelChecks: competition.cancel_checks || false,
            minNetNumber: competition.min_net_number || 0,
            maxNetNumber: competition.max_net_number || 255,
            registrationOpen: competition.registration_open !== false,
            registrationConfirmText: competition.registration_confirm_text || '',
            isActive: competition.start && new Date() >= new Date(competition.start) &&
                (!competition.end || new Date() <= new Date(competition.end))
        };
    } catch (error) {
        const errorMsg = `Failed to fetch competition for edit: ${error.message || 'Unknown error'}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
    }
};

/**
 * Update or create competition
 * @param {object} data - Competition data
 * @returns {object} Result object with success status and message
 */
const updateCompetition = async (data) => {
    try {
        // Validate data first (includes divisibility check)
        const validation = validateCompetitionData(data);
        if (!validation.valid) {
            return {
                success: false,
                errors: validation.errors
            };
        }

        // Parse dates from admin input (assumed to be Vietnam time)
        const servicesPublicDate = parseDate(data.services_public);
        const startDate = parseDate(data.start);
        const endDate = parseDate(data.end);
        const tickDuration = parseInt(data.tick_duration);

        // Convert from Vietnam timezone (UTC+7) to UTC for database storage
        const VN_TIMEZONE_OFFSET_MS = 7 * 60 * 60 * 1000; // 7 hours
        const servicesPublicDateUTC = new Date(servicesPublicDate.getTime() - VN_TIMEZONE_OFFSET_MS);
        const startDateUTC = new Date(startDate.getTime() - VN_TIMEZONE_OFFSET_MS);
        const endDateUTC = new Date(endDate.getTime() - VN_TIMEZONE_OFFSET_MS);

        // Find existing or create new
        let competition = await ScoringGamecontrol.findOne();

        const competitionData = {
            competition_name: data.competition_name,
            flag_prefix: data.flag_prefix,
            services_public: servicesPublicDateUTC,
            start: startDateUTC,
            end: endDateUTC,
            tick_duration: tickDuration,
            valid_ticks: 1, // Keep as 0, don't auto-calculate
            current_tick: 0,
            cancel_checks: data.cancel_checks === true || data.cancel_checks === 'true',
            min_net_number: parseInt(data.min_net_number),
            max_net_number: parseInt(data.max_net_number),
            registration_open: data.registration_open === true || data.registration_open === 'true',
            registration_confirm_text: data.registration_confirm_text
        };

        if (!competition) {
            competition = await ScoringGamecontrol.create(competitionData);
        } else {
            await competition.update(competitionData);
        }

        return {
            success: true,
            message: 'Competition updated successfully',
            data: await getCurrentCompetition()
        };
    } catch (error) {
        console.error('Error updating competition:', error);
        return {
            success: false,
            errors: ['Failed to update competition: ' + error.message]
        };
    }
};

module.exports = {
    parseDate,
    formatDateToPicker,
    formatDateDisplay,
    validateCompetitionData,
    calculateValidTicks,
    getCurrentCompetition,
    getCompetitionForEdit,
    updateCompetition
};
