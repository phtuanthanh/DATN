const servicesService = require('../services/servicesServices');

/**
 * Render services management page
 */
const getServicesPage = async (req, res) => {
    try {
        const services = await servicesService.getAllServices();
        res.render('services-page', {
            services,
            currentTab: 'services'
        });
    } catch (error) {
        console.error('Error rendering services page:', error);
        res.status(500).render('error', { error: 'Failed to load services page' });
    }
};

/**
 * Get all services as JSON
 */
const getServices = async (req, res) => {
    try {
        const services = await servicesService.getAllServices();
        res.json({
            success: true,
            data: services
        });
    } catch (error) {
        console.error('Error fetching services:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch services'
        });
    }
};

/**
 * Create a new service
 */
const createService = async (req, res) => {
    try {
        const result = await servicesService.createService(req.body);
        console.log(req.body)
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Error creating service:', error);
        res.status(500).json({
            success: false,
            errors: ['Server error: ' + error.message]
        });
    }
};

/**
 * Update an existing service
 */
const updateService = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await servicesService.updateService(id, req.body);

        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Error updating service:', error);
        res.status(500).json({
            success: false,
            errors: ['Server error: ' + error.message]
        });
    }
};

/**
 * Delete a service
 */
const deleteService = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await servicesService.deleteService(id);

        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Error deleting service:', error);
        res.status(500).json({
            success: false,
            errors: ['Server error: ' + error.message]
        });
    }
};

module.exports = {
    getServicesPage,
    getServices,
    createService,
    updateService,
    deleteService
};
