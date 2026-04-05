const { ScoringService } = require('../models');
const { Op } = require('sequelize');

/**
 * Validate service data
 * @param {object} data - Service data to validate
 * @returns {object} Validation result with valid flag and errors array
 */
const validateServiceData = (data) => {
    const errors = [];

    // === REQUIRED FIELDS VALIDATION ===
    if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
        errors.push('Service name is required and must be text');
    }

    if (!data.slug || typeof data.slug !== 'string' || !data.slug.trim()) {
        errors.push('Service slug is required and must be text');
    }

    if (data.margin === undefined || data.margin === '') {
        errors.push('Margin is required');
    }

    if (errors.length > 0) {
        return { valid: false, errors };
    }

    // === TYPE VALIDATION ===
    const margin = parseFloat(data.margin);
    if (isNaN(margin)) {
        errors.push('Margin must be a valid number');
    }

    // === SLUG FORMAT VALIDATION ===
    if (!data.slug.match(/^[a-z0-9\-_]+$/i)) {
        errors.push('Slug can only contain letters, numbers, hyphens, and underscores');
    }

    if (errors.length > 0) {
        return { valid: false, errors };
    }

    return { valid: true, errors: [] };
};

/**
 * Get all services
 * @returns {array} List of all services
 */
const getAllServices = async () => {
    try {
        const services = await ScoringService.findAll({
            order: [['id', 'ASC']]
        });
        return services;
    } catch (error) {
        const errorMsg = `Failed to fetch services: ${error.message || 'Unknown error'}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
    }
};

/**
 * Get service by ID
 * @param {number} id - Service ID
 * @returns {object} Service object or null
 */
const getServiceById = async (id) => {
    try {
        const service = await ScoringService.findByPk(id);
        return service || null;
    } catch (error) {
        const errorMsg = `Failed to fetch service by ID: ${error.message || 'Unknown error'}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
    }
};

/**
 * Create a new service
 * @param {object} data - Service data
 * @returns {object} Result object with success status and message
 */
const createService = async (data) => {
    try {
        // Validate data
        const validation = validateServiceData(data);
        if (!validation.valid) {
            return {
                success: false,
                errors: validation.errors
            };
        }

        // Check if name or slug already exists
        const existingService = await ScoringService.findOne({
            where: {
                [Op.or]: [
                    { name: data.name.trim() },
                    { slug: data.slug.trim() }
                ]
            }
        });

        if (existingService) {
            return {
                success: false,
                errors: ['Service name or slug already exists']
            };
        }

        const service = await ScoringService.create({
            name: data.name.trim(),
            slug: data.slug.trim(),
            margin: parseFloat(data.margin)
        });

        return {
            success: true,
            message: 'Service created successfully',
            data: service
        };
    } catch (error) {
        console.error('Error creating service:', error);
        return {
            success: false,
            errors: ['Failed to create service: ' + error.message]
        };
    }
};

/**
 * Update a service
 * @param {number} id - Service ID
 * @param {object} data - Service data
 * @returns {object} Result object with success status and message
 */
const updateService = async (id, data) => {
    try {
        // Validate data
        const validation = validateServiceData(data);
        if (!validation.valid) {
            return {
                success: false,
                errors: validation.errors
            };
        }

        const service = await ScoringService.findByPk(id);
        if (!service) {
            return {
                success: false,
                errors: ['Service not found']
            };
        }

        // Check if name or slug already exists (excluding current service)
        const existingService = await ScoringService.findOne({
            where: {
                id: { [Op.ne]: id },
                [Op.or]: [
                    { name: data.name.trim() },
                    { slug: data.slug.trim() }
                ]
            }
        });

        if (existingService) {
            return {
                success: false,
                errors: ['Service name or slug already exists']
            };
        }

        await service.update({
            name: data.name.trim(),
            slug: data.slug.trim(),
            margin: parseFloat(data.margin)
        });

        return {
            success: true,
            message: 'Service updated successfully',
            data: service
        };
    } catch (error) {
        console.error('Error updating service:', error);
        return {
            success: false,
            errors: ['Failed to update service: ' + error.message]
        };
    }
};

/**
 * Delete a service
 * @param {number} id - Service ID
 * @returns {object} Result object with success status and message
 */
const deleteService = async (id) => {
    try {
        const service = await ScoringService.findByPk(id);
        if (!service) {
            return {
                success: false,
                errors: ['Service not found']
            };
        }

        await service.destroy();

        return {
            success: true,
            message: 'Service deleted successfully'
        };
    } catch (error) {
        console.error('Error deleting service:', error);

        // Parse error message - extract meaningful text only
        let errorMsg = 'Failed to delete service';
        if (error.message) {
            if (error.message.includes('foreign key constraint')) {
                errorMsg = 'Cannot delete service: it has existing dependencies or is being used';
            } else if (error.message.includes('violates')) {
                errorMsg = 'Cannot delete service: operation violates database constraints';
            } else {
                // Extract just the core error text, not full stack
                const match = error.message.match(/^([^:]+)/);
                errorMsg = match ? `Failed to delete service: ${match[0]}` : 'Failed to delete service';
            }
        }

        return {
            success: false,
            errors: [errorMsg]
        };
    }
};

module.exports = {
    validateServiceData,
    getAllServices,
    getServiceById,
    createService,
    updateService,
    deleteService
};
