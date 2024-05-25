import { Config } from './classes/Config';
import { log } from './classes/Logger';
import { MailQueue } from './classes/MailQueue';
import { SMTPServer } from './classes/SMTPServer';

if(process.argv.includes('-v') || process.argv.includes('--version')) // We're asked for our version?
    console.log(`SMTP2Graph v${VERSION}`);
else
{
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
}

// Exit with code 0 on Ctrl+C
process.on('SIGINT', ()=>{
    process.exit(0);
});
