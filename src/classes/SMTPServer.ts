import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { SMTPServer as NodeSMTP, SMTPServerOptions } from 'smtp-server';
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import MailComposer from 'nodemailer/lib/mail-composer';
import addressparser, { Address } from 'nodemailer/lib/addressparser';
const Splitter = require('mailsplit').Splitter;
const Joiner = require('mailsplit').Joiner;
import { Config } from './Config';
import { prefixedLog } from './Logger';
import { MailQueue } from './MailQueue';

const log = prefixedLog('SMTPServer');

export class SMTPServer
{
    #server: NodeSMTP;
    #queue: MailQueue;
    #messageRateLimiter = new RateLimiterMemory({
        duration: Config.smtpRateLimitDuration,
        points: Config.smtpRateLimitLimit,
    });
    #authLimiter = new RateLimiterMemory({
        duration: Config.smtpAuthLimitDuration,
        points: Config.smtpAuthLimitLimit,
    });
    #sessionIpById = new Map<string, string>();
    #sessionCountByIp = new Map<string, number>();

    constructor(queue: MailQueue)
    {
        this.#queue = queue;
        this.#server = new NodeSMTP({
            onConnect: this.#onConnect,
            onClose: this.#onClose,
            onAuth: this.#onAuth,
            onMailFrom: this.#onMailFrom,
            onData: this.#onData,
            authOptional: !Config.smtpRequireAuth,
            banner: Config.smtpBanner ?? `SMTP2Graph ${VERSION}`,
            size: Config.smtpMaxSize,
            secure: Config.smtpSecure,
            key: Config.smtpTlsKey,
            cert: Config.smtpTlsCert,
            allowInsecureAuth: Config.smtpAllowTls?Config.smtpAllowInsecureAuth:true,
            disabledCommands: Config.smtpAllowTls?undefined:['STARTTLS'],
        });
    }

    listen()
    {
        return new Promise<void>((resolve, reject)=>{
            this.#server.on('error', reject);

            this.#server.listen(Config.smtpPort, Config.smtpListenIp, ()=>{
                log('info', `Server started on ${Config.smtpListenIp || 'any-ip'}:${Config.smtpPort}`);
                this.#server.off('error', reject);
                this.#server.on('error', error=>{
                    log('error', `An error occured`, {error});
                });
                resolve();
            });
        });
    }

    #onConnect: SMTPServerOptions['onConnect'] = (session, callback)=>
    {
        if(!Config.isIpAllowed(session.remoteAddress))
        {
            callback(new Error(`IP ${session.remoteAddress} is not allowed to connect`));
            return;
        }

        const activeSessions = this.#sessionCountByIp.get(session.remoteAddress) ?? 0;
        if(Config.smtpMaxSessionsPerIp !== undefined && activeSessions >= Config.smtpMaxSessionsPerIp)
        {
            const error = new Error('Too many concurrent sessions from this IP address');
            (<any>error).responseCode = 421;
            callback(error);
            return;
        }

        this.#sessionIpById.set(session.id, session.remoteAddress);
        this.#sessionCountByIp.set(session.remoteAddress, activeSessions + 1);
        callback();
    };

    #onClose: SMTPServerOptions['onClose'] = (session, callback)=>
    {
        const clientIp = this.#sessionIpById.get(session.id);
        if(clientIp)
        {
            this.#sessionIpById.delete(session.id);
            const activeSessions = this.#sessionCountByIp.get(clientIp) ?? 0;
            if(activeSessions <= 1)
                this.#sessionCountByIp.delete(clientIp);
            else
                this.#sessionCountByIp.set(clientIp, activeSessions - 1);
        }
        callback?.();
    };

    #onAuth: SMTPServerOptions['onAuth'] = (auth, session, callback)=>
    {
        this.#authLimiter.consume(session.remoteAddress).then((rateLimit)=>{
            if(!auth.username || !auth.password)
                callback(new Error('Unsupported authentication method'));
            else if(Config.isUserAllowed(auth.username, auth.password))
                callback(null, {user: auth.username});
            else
                callback(new Error('Invalid login'));
        }).catch((rateLimit: RateLimiterRes)=>{
            callback(new Error(`Too many failed logins`));
        });
    };

    #onMailFrom: SMTPServerOptions['onMailFrom'] = (address, session, callback)=>
    {
        if(!Config.isFromAllowed(address.address, session.user))
        {
            callback(new Error(`FROM "${address.address}" not allowed`));
            return;
        }
        if(this.#queue.isAtOrAboveRejectThreshold())
        {
            const error = new Error('Queue capacity threshold reached. Try again later');
            (<any>error).responseCode = 451;
            callback(error);
            return;
        }

        const clientKey = session.user || session.remoteAddress;
        this.#messageRateLimiter.consume(clientKey).then(()=>{
            callback();
        }).catch((rateLimit: RateLimiterRes)=>{
            const error = new Error(`Rate limit exceeded. Try again in ${Math.ceil(rateLimit.msBeforeNext/1000)} seconds`);
            (<any>error).responseCode = 451;
            callback(error);
        });
    };

    #onData: SMTPServerOptions['onData'] = (stream, session, callback)=>
    {
        if(!session.envelope.mailFrom)
        {
            callback(new Error('Missing FROM'));
            return;
        }

        const mail = new MailComposer({
            messageId: session.id,
            raw: stream,
        });

        // Inject BCC header if necessary
        const envelope = {...session.envelope}; // We need a copy, because the envelope object will get overwritten while parsing
        const splitter = new Splitter();
        splitter.on('data', (data: any)=>{
            if(data.type === 'node')
            {
                // Inject from header if needed
                try {
                    if(!data.headers.hasHeader('From') && envelope.mailFrom)
                        data.headers.add('From', envelope.mailFrom.address);
                } catch(error) {
                    log('error', `Failed to inject from header`, {error});
                }

                // Inject bcc header if needed
                try {
                    if(!data.headers.hasHeader('Bcc')) // We don't have a BCC header?
                    {
                        // Collect all TO and CC recipients
                        const visibleRecipients: Address[] = [];
                        if(data.headers.hasHeader('To')) visibleRecipients.push(...addressparser(data.headers.get('To'), {flatten: true}));
                        if(data.headers.hasHeader('Cc')) visibleRecipients.push(...addressparser(data.headers.get('Cc'), {flatten: true}));

                        // Check if there are recipients missing from TO/CC, in that case we add them as BCC
                        const bcc = envelope.rcptTo.filter(rcpt=>!visibleRecipients.some(visible=>visible.address.toLowerCase()===rcpt.address.toLowerCase()));
                        if(bcc.length) data.headers.add('Bcc', bcc.map(r=>r.address).join(', '));
                    }
                } catch(error) {
                    log('error', `Failed to inject BCC header`, {error});
                }
            }
        });

        // Create the EML file
        const tmpFile = path.join(this.#queue.tempPath, `${session.id}-${randomUUID().toString()}.eml`);
        const writeStream = fs.createWriteStream(tmpFile);
        const mailCompile = mail.compile();
        (mailCompile as any).keepBcc = true;
        mailCompile.createReadStream().pipe(splitter).pipe(new Joiner()).pipe(writeStream);

        // Windows can keep a handle open for a short time even after 'finish' fires.
        // the rename that occurs in MailQueue.add must wait until the underlying
        // file descriptor is closed, which is signalled by the 'close' event.
        writeStream.on('close', async () => {
            if(stream.sizeExceeded)
            {
                const err = new Error('Message exceeds fixed maximum message size');
                (<any>err).responseCode = 552;
                callback(err);

                try {
                    fs.unlinkSync(tmpFile);
                } catch {
                    // ignore, it may already be removed by cleanup logic
                }
            }
            else
            {
                try {
                    await this.#queue.add(tmpFile);
                    callback();
                } catch(error) {
                    log('error', 'Failed to durably enqueue message', {error});
                    const err = new Error('Temporary failure while queuing message');
                    (<any>err).responseCode = 451;
                    callback(err);
                }
            }
        });

        // ensure the stream is ended when the mail compiles (pipe will do this for us,
        // but explictly listening for 'finish' lets us log/debug if needed)
        writeStream.on('finish', ()=>{
            log('verbose', 'EML write finished, waiting for close');
        });
    };
    
}
