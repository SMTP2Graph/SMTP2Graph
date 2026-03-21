import { Router } from 'express';
import { ConfigService } from '../services/ConfigService';

export function configRoutes(): Router
{
    const router = Router();
    const configService = new ConfigService();

    // Get current config
    router.get('/config', (req, res) => {
        try {
            const showSecrets = req.query.showSecrets === 'true';
            const config = configService.getConfig(showSecrets);
            res.json(config);
        } catch(error) {
            res.status(500).json({error: 'Failed to read config'});
        }
    });

    // Update config
    router.put('/config', (req, res) => {
        try {
            const result = configService.updateConfig(req.body);
            if(result.success)
                res.json({success: true, message: 'Config saved. Restart required for changes to take effect.'});
            else
                res.status(400).json({success: false, errors: result.errors});
        } catch(error) {
            res.status(500).json({error: 'Failed to save config'});
        }
    });

    // Get JSON schema
    router.get('/config/schema', (req, res) => {
        try {
            const schema = configService.getSchema();
            res.json(schema);
        } catch(error) {
            res.status(500).json({error: 'Failed to read schema'});
        }
    });

    return router;
}
