import { Config } from './classes/Config';
import { log } from './classes/Logger';
import { MailQueue } from './classes/MailQueue';
import { SMTPServer } from './classes/SMTPServer';

(async ()=>{
    // Validate the config before continuing
    try {
        Config.validate();
    } catch(error) {
        await log('error', `Invalid config. ${String(error)}`, {error});
        process.exit(1);
    }

    const queue = new MailQueue();
    const server = new SMTPServer(queue);
    try {
        await server.listen();
    } catch(error) {
        log('error', `Failed to start SMTP server. ${String(error)}`, {error});
        process.exit(1);
    }
})();
