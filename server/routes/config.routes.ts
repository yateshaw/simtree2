import { Router } from 'express';
import { configService } from '../services/config.service';
import { z } from 'zod';

const router = Router();

// Middleware to ensure ONLY sadmin (super admin) access
const requireSuperAdminOnly = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const user = req.user;
  if (!user?.isSuperAdmin || user.role !== 'superadmin' || user.username !== 'sadmin') {
    return res.status(403).json({ 
      error: 'Unauthorized. System configuration access restricted to super administrator only.' 
    });
  }
  
  next();
};

// Get all system configurations
router.get('/system', requireSuperAdminOnly, async (req, res) => {
  try {
    const configs = await configService.getAllSystemConfigs();
    res.json({ success: true, data: configs });
  } catch (error) {
    console.error('Error fetching system configs:', error);
    res.status(500).json({ error: 'Failed to fetch system configurations' });
  }
});

// Get all company configurations
router.get('/company', requireSuperAdminOnly, async (req, res) => {
  try {
    const companyId = req.query.companyId ? parseInt(req.query.companyId as string) : undefined;
    const configs = await configService.getAllCompanyConfigs(companyId);
    res.json({ success: true, data: configs });
  } catch (error) {
    console.error('Error fetching company configs:', error);
    res.status(500).json({ error: 'Failed to fetch company configurations' });
  }
});

// Get specific configuration value
router.get('/value/:key', requireSuperAdminOnly, async (req, res) => {
  try {
    const { key } = req.params;
    const companyId = req.query.companyId ? parseInt(req.query.companyId as string) : undefined;
    
    const value = await configService.getConfig(key, companyId);
    res.json({ success: true, data: { key, value } });
  } catch (error) {
    console.error('Error fetching config value:', error);
    res.status(500).json({ error: 'Failed to fetch configuration value' });
  }
});

// Set system configuration
const setSystemConfigSchema = z.object({
  key: z.string(),
  value: z.string(),
  category: z.string(),
  description: z.string().optional(),
});

router.post('/system', requireSuperAdminOnly, async (req, res) => {
  try {
    const { key, value, category, description } = setSystemConfigSchema.parse(req.body);
    
    await configService.setSystemConfig(key, value, category, description);
    res.json({ success: true, message: 'System configuration updated' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Error setting system config:', error);
    res.status(500).json({ error: 'Failed to update system configuration' });
  }
});

// Update system configuration
const updateSystemConfigSchema = z.object({
  value: z.string(),
  description: z.string().optional(),
});

router.put('/system/:id', requireSuperAdminOnly, async (req, res) => {
  try {
    const configId = parseInt(req.params.id);
    const { value, description } = updateSystemConfigSchema.parse(req.body);
    
    await configService.updateSystemConfig(configId, value, description);
    res.json({ success: true, message: 'System configuration updated' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Error updating system config:', error);
    res.status(500).json({ error: 'Failed to update system configuration' });
  }
});

// Set company configuration
const setCompanyConfigSchema = z.object({
  companyId: z.number(),
  key: z.string(),
  value: z.string(),
  category: z.string(),
  description: z.string().optional(),
});

router.post('/company', requireSuperAdminOnly, async (req, res) => {
  try {
    const { companyId, key, value, category, description } = setCompanyConfigSchema.parse(req.body);
    
    await configService.setCompanyConfig(companyId, key, value, category, description);
    res.json({ success: true, message: 'Company configuration updated' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Error setting company config:', error);
    res.status(500).json({ error: 'Failed to update company configuration' });
  }
});

// Update company configuration
const updateCompanyConfigSchema = z.object({
  value: z.string(),
  description: z.string().optional(),
});

router.put('/company/:id', requireSuperAdminOnly, async (req, res) => {
  try {
    const configId = parseInt(req.params.id);
    const { value, description } = updateCompanyConfigSchema.parse(req.body);
    
    await configService.updateCompanyConfig(configId, value, description);
    res.json({ success: true, message: 'Company configuration updated' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Error updating company config:', error);
    res.status(500).json({ error: 'Failed to update company configuration' });
  }
});

// Get business configuration (publicly accessible helper)
router.get('/business', async (req, res) => {
  try {
    const config = await configService.getBusinessConfig();
    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Error fetching business config:', error);
    res.status(500).json({ error: 'Failed to fetch business configuration' });
  }
});

// Clear configuration cache
router.post('/clear-cache', requireSuperAdminOnly, async (req, res) => {
  try {
    configService.clearCache();
    res.json({ success: true, message: 'Configuration cache cleared' });
  } catch (error) {
    console.error('Error clearing config cache:', error);
    res.status(500).json({ error: 'Failed to clear configuration cache' });
  }
});

export default router;