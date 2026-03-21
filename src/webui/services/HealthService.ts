import { MailQueue } from '../../classes/MailQueue';
import { SMTPServer } from '../../classes/SMTPServer';
import { Mailer } from '../../classes/Mailer';
import { Config } from '../../classes/Config';

export class HealthService
{
    #queue: MailQueue;
    #smtpServer: SMTPServer;

    constructor(queue: MailQueue, smtpServer: SMTPServer)
    {
        this.#queue = queue;
        this.#smtpServer = smtpServer;
    }

    async getHealth()
    {
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

        return {
            smtp: {
                listening: this.#smtpServer.isListening,
                port: Config.smtpPort,
                mode: Config.mode,
            },
            accounts: accountHealth,
            queue: this.#queue.queueStats,
            paused: this.#queue.isPaused,
            uptime: process.uptime(),
            version: VERSION,
        };
    }
}
