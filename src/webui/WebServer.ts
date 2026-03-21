import express, { Request, Response, NextFunction } from 'express';
import { Config } from '../classes/Config';
import { prefixedLog } from '../classes/Logger';
import { MailQueue } from '../classes/MailQueue';
import { SMTPServer } from '../classes/SMTPServer';
import { configRoutes } from './routes/configRoutes';
import { healthRoutes } from './routes/healthRoutes';
import { accountRoutes } from './routes/accountRoutes';

const log = prefixedLog('WebUI');

export class WebServer
{
    #app: express.Application;
    #queue: MailQueue;
    #smtpServer: SMTPServer;

    constructor(queue: MailQueue, smtpServer: SMTPServer)
    {
        this.#queue = queue;
        this.#smtpServer = smtpServer;
        this.#app = express();

        this.#setupMiddleware();
        this.#setupRoutes();
    }

    #setupMiddleware()
    {
        // JSON body parser
        this.#app.use(express.json());

        // Basic Auth
        this.#app.use((req: Request, res: Response, next: NextFunction) => {
            const auth = req.headers.authorization;
            if(!auth || !auth.startsWith('Basic '))
            {
                res.setHeader('WWW-Authenticate', 'Basic realm="SMTP2Graph WebUI"');
                res.status(401).send('Authentication required');
                return;
            }

            const decoded = Buffer.from(auth.substring(6), 'base64').toString();
            const colonIdx = decoded.indexOf(':');
            const username = decoded.substring(0, colonIdx);
            const password = decoded.substring(colonIdx + 1);

            if(username === Config.webuiUsername && password === Config.webuiPassword)
                next();
            else
            {
                res.setHeader('WWW-Authenticate', 'Basic realm="SMTP2Graph WebUI"');
                res.status(401).send('Invalid credentials');
            }
        });
    }

    #setupRoutes()
    {
        // API routes
        this.#app.use('/api', configRoutes());
        this.#app.use('/api', healthRoutes(this.#queue, this.#smtpServer));
        this.#app.use('/api', accountRoutes());

        // Static files — serve embedded HTML/JS/CSS
        this.#app.get('/', (req, res) => {
            res.type('html').send(require('./public/index.html'));
        });
        this.#app.get('/app.js', (req, res) => {
            res.type('js').send(require('./public/app.js'));
        });
        this.#app.get('/style.css', (req, res) => {
            res.type('css').send(require('./public/style.css'));
        });
    }

    listen(): Promise<void>
    {
        return new Promise((resolve) => {
            this.#app.listen(Config.webuiPort, Config.webuiListenAddress, () => {
                log('info', `WebUI started on ${Config.webuiListenAddress}:${Config.webuiPort}`);
                resolve();
            });
        });
    }
}
