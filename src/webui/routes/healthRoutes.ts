import { Router } from 'express';
import { MailQueue } from '../../classes/MailQueue';
import { SMTPServer } from '../../classes/SMTPServer';
import { Mailer } from '../../classes/Mailer';
import { Config } from '../../classes/Config';
import fs from 'fs';
import path from 'path';

export function healthRoutes(queue: MailQueue, smtpServer: SMTPServer): Router
{
    const router = Router();

    // Overall health status
    router.get('/health', async (req, res) => {
        const accountHealth = [];
        for(const account of Config.accounts)
        {
            const connectivity = await Mailer.testConnection(account);
            accountHealth.push({
                name: account.name,
                tenant: account.appReg.tenant,
                graphApi: connectivity,
            });
        }

        res.json({
            smtp: {
                listening: smtpServer.isListening,
                port: Config.smtpPort,
                mode: Config.mode,
            },
            accounts: accountHealth,
            queue: queue.queueStats,
            paused: queue.isPaused,
            uptime: process.uptime(),
            version: VERSION,
        });
    });

    // Queue statistics
    router.get('/queue', (req, res) => {
        res.json(queue.queueStats);
    });

    // Recent log entries
    router.get('/logs', (req, res) => {
        const lines = parseInt(req.query.lines as string) || 100;
        const logFile = path.join('logs', 'combined.log');

        try {
            if(!fs.existsSync(logFile))
            {
                res.json([]);
                return;
            }

            const content = fs.readFileSync(logFile, 'utf-8');
            const allLines = content.trim().split('\n').filter(l => l);
            const recent = allLines.slice(-lines);

            // Parse JSON log entries
            const entries = recent.map(line => {
                try { return JSON.parse(line); }
                catch { return {message: line}; }
            });

            res.json(entries);
        } catch(error) {
            res.status(500).json({error: 'Failed to read logs'});
        }
    });

    return router;
}
