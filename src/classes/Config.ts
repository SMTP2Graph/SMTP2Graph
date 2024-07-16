import fs from 'fs';
import { parse as parseYaml } from 'yaml';
import IPCIDR from 'ip-cidr';
import { AxiosProxyConfig } from 'axios';

// Set the working dir based on the --baseDir argument
const baseDir = process.argv.find(arg=>arg.startsWith('--baseDir=') && arg.length > 10)?.substring(10);
if(baseDir) process.chdir(baseDir);

export interface IConfig
{
    mode: 'full'|'receive'|'send';
    send?: {
        appReg: {
            /** The tenant name (the part that comes before .onmicrosoft.com) */
            tenant: string,
            /** Entra ID App. registration client ID */
            id: string,
            /** Entra ID App. registration secret */
            secret?: string,
            /** Enrta ID App. registrations client certificate */
            certificate?: {
                thumbprint: string,
                privateKeyPath: string;
            },
        },
        /** Times to retry sending a message when it failed (0 = do not retry) */
        retryLimit?: number;
        /** Minutes between tries */
        retryInterval?: number;
        /** Always send from this mailbox */
        forceMailbox?: string;
    },
    receive?: {
        /** The port on which the SMTP server will listen (default: 25) */
        port?: number;
        /** Listen for connection on a specific IP */
        listenAddress?: string;
        /** Require a secure (TLS) connection */
        secure?: boolean;
        /** Path to the TLS key file */
        tlsKeyPath?: string;
        /** Path to the TLS certificate file */
        tlsCertPath?: string;
        /** Maximum allowed mail size. Accepts string ending with 'k' (Kilobytes) or 'm' (Megabytes) */
        maxSize?: string;
        /** The banner being shown when a client connects to the STMP server */
        banner?: string;
        /** IP addresses that are allowed to connect. This can contain single addresses or subnets in CIDR format (eg. 192.168.1.0/24) */
        ipWhitelist?: string[];
        /** Only accept those addresses as FROM addresses */
        allowedFrom?: string[];
        /** Allows authentication even if connection is not secured first, when tlsKeyPath and tlsCertPath are set */
        allowInsecureAuth?: boolean;
        /** Require login */
        requireAuth?: boolean;
        users?: {username: string, password: string, allowedFrom?: string[]}[];
        rateLimit?: {
            duration?: number,
            limit?: number;
        };
        authLimit?: {
            duration?: number,
            limit?: number;
        };
    },
    httpProxy?: {
        host: string,
        port: number,
        protocol?: 'http'|'https',
        username?: string,
        password?: string,
    }
}

export class InvalidConfig extends Error { }

export class Config
{
    static #configData: IConfig | undefined;

    /** Check if the config file is valid */
    static validate()
    {
        const isStringValue = (val: any)=>{
            return (typeof val === 'string' && val);
        };

        if(typeof this.mode !== 'string' || !['full','receive','send'].includes(this.mode))
            throw new InvalidConfig('Invalid "mode" config property');

        if(this.mode !== 'receive') // We're also sending?
        {
            if(!isStringValue(this.clientId))
                throw new InvalidConfig('Missing "appReg.id" property');
            else if(!isStringValue(this.clientSecret) && !isStringValue(this.clientCertificateKeyPath) && !isStringValue(this.clientCertificateThumbprint))
                throw new InvalidConfig('Missing "appReg.secret" or "appReg.certificate" property');
            else if(this.clientCertificateKeyPath && !fs.existsSync(this.clientCertificateKeyPath))
                throw new InvalidConfig(`Client key file "${this.clientCertificateKeyPath}" could not be found`);
            else if(!isStringValue(this.clientTenant))
                throw new InvalidConfig('Missing "appReg.tenant" property');
        }
        
        if(this.sendRetryInterval !== undefined && this.sendRetryInterval < 1)
            throw new InvalidConfig('"retryInterval" may not be smaller than 1');
        else if(this.smtpRequireAuth && !this.smtpUsers?.length)
            throw new InvalidConfig('"requireAuth" enabled without users defined');
        else if(this.#config.receive?.maxSize && (typeof this.#config.receive.maxSize !== 'string' || !/^\d+k|m$/i.test(this.#config.receive.maxSize)))
            throw new InvalidConfig('"maxSize" property is invalid');
        else if(this.smtpListenIp && !IPCIDR.isValidAddress(this.smtpListenIp))
            throw new InvalidConfig('"listenAddress" property is invalid');
        else if(this.smtpTlsKeyPath && !fs.existsSync(this.smtpTlsKeyPath))
            throw new InvalidConfig(`Key file "${this.smtpTlsKeyPath}" could not be found`);
        else if(this.smtpTlsCertPath && !fs.existsSync(this.smtpTlsCertPath))
            throw new InvalidConfig(`Cert file "${this.smtpTlsCertPath}" could not be found`);
        else if(this.smtpTlsKeyPath && !this.smtpTlsCertPath)
            throw new InvalidConfig(`Property "tlsKeyPath" is defined without "tlsCertPath"`);
        else if(!this.smtpTlsKeyPath && this.smtpTlsCertPath)
            throw new InvalidConfig(`Property "smtpTlsCertPath" is defined without "tlsKeyPath"`);
        else if(this.smtpRateLimitDuration && typeof this.smtpRateLimitDuration !== 'number')
            throw new InvalidConfig(`Property "receive.rateLimit.duration" should be a number`);
        else if(this.smtpRateLimitLimit && typeof this.smtpRateLimitLimit !== 'number')
            throw new InvalidConfig(`Property "receive.rateLimit.limit" should be a number`);
        else if(this.smtpAuthLimitDuration && typeof this.smtpAuthLimitDuration !== 'number')
            throw new InvalidConfig(`Property "receive.authLimit.duration" should be a number`);
        else if(this.smtpAuthLimitDuration && typeof this.smtpAuthLimitDuration !== 'number')
            throw new InvalidConfig(`Property "receive.authLimit.limit" should be a number`);
        else if(this.#config.httpProxy && typeof this.#config.httpProxy.host !== 'string')
            throw new InvalidConfig(`Property "httpProxy.host" should be a string`);
        else if(this.#config.httpProxy && typeof this.#config.httpProxy.port !== 'number')
            throw new InvalidConfig(`Property "httpProxy.port" should be a number`);
        else if(this.#config.httpProxy?.protocol && !['http','https'].includes(this.#config.httpProxy.protocol))
            throw new InvalidConfig(`Property "httpProxy.protocol" should be a http or https`);
        else if(this.#config.httpProxy?.username && !this.#config.httpProxy.password)
            throw new InvalidConfig(`Property "httpProxy.username" is defined without "httpProxy.password"`);
        else if(this.#config.httpProxy?.password && !this.#config.httpProxy.username)
            throw new InvalidConfig(`Property "httpProxy.password" is defined without "httpProxy.username"`);
    }

    static get mode()
    {
        return this.#config.mode.toLowerCase() as IConfig['mode'];
    }

    static get msalAuthority()
    {
        if(/^[0-9a-f]{8}\-[0-9a-f]{4}\-[0-9a-f]{4}\-[0-9a-f]{4}\-[0-9a-f]{12}$/i.test(this.clientTenant || '')) // We got a GUID instead of name?
            return `https://login.microsoftonline.com/${this.clientTenant}`;
        else
            return `https://login.microsoftonline.com/${this.clientTenant}.onmicrosoft.com`;
    }

    static get clientTenant()
    {
        return this.#config.send?.appReg.tenant;
    }

    static get clientId()
    {
        return this.#config.send?.appReg.id;
    }

    static get clientSecret()
    {
        return this.#config.send?.appReg.secret;
    }

    static get clientCertificateThumbprint()
    {
        return this.#config.send?.appReg.certificate?.thumbprint;
    }

    static get clientCertificateKeyPath()
    {
        return this.#config.send?.appReg.certificate?.privateKeyPath;
    }

    static get clientCertificateKey()
    {
        if(this.clientCertificateKeyPath && fs.existsSync(this.clientCertificateKeyPath))
            return fs.readFileSync(this.clientCertificateKeyPath).toString();
    }

    static get sendRetryLimit()
    {
        return this.#config.send?.retryLimit ?? 3;
    }

    static get sendRetryInterval()
    {
        return this.#config.send?.retryInterval ?? 5;
    }

    static get forceMailbox()
    {
        return this.#config.send?.forceMailbox;
    }

    static get smtpPort(): number
    {
        return this.#config.receive?.port ?? this.getConfigArg('receive.port', 'number') ?? 25;
    }

    static get smtpListenIp()
    {
        return this.#config.receive?.listenAddress;
    }

    static get smtpSecure()
    {
        return Boolean(this.#config.receive?.secure);
    }

    static get smtpTlsKeyPath()
    {
        return this.#config.receive?.tlsKeyPath;
    }

    static get smtpTlsKey()
    {
        if(this.smtpTlsKeyPath && fs.existsSync(this.smtpTlsKeyPath))
            return fs.readFileSync(this.smtpTlsKeyPath);
    }

    static get smtpTlsCertPath()
    {
        return this.#config.receive?.tlsCertPath;
    }

    static get smtpTlsCert()
    {
        if(this.smtpTlsCertPath && fs.existsSync(this.smtpTlsCertPath))
            return fs.readFileSync(this.smtpTlsCertPath);
    }

    static get smtpAllowTls()
    {
        return Boolean(this.smtpTlsCertPath && this.smtpTlsKeyPath && fs.existsSync(this.smtpTlsCertPath) && fs.existsSync(this.smtpTlsKeyPath));
    }

    /** Maximum message size in bytes */
    static get smtpMaxSize(): number | undefined
    {
        const matches = this.#config.receive?.maxSize?/^(\d+)(k|m)$/.exec(this.#config.receive.maxSize.toLowerCase()):undefined;

        if(matches)
        {
            if(matches[2] === 'k')
                return Number(matches[1])*1024;
            else if(matches[2] === 'm')
                return Number(matches[1])*1024*1024;
        }

        return 100*1024*1024; // Default to 100MB
    }

    static get smtpBanner()
    {
        return this.#config.receive?.banner;
    }

    static get smtpAllowInsecureAuth()
    {
        return this.#config.receive?.allowInsecureAuth;
    }

    static get smtpRequireAuth()
    {
        return this.#config.receive?.requireAuth;
    }

    static get smtpUsers()
    {
        return this.#config.receive?.users;
    }

    static get smtpRateLimitDuration()
    {
        return this.#config.receive?.rateLimit?.duration ?? 600;
    }

    static get smtpRateLimitLimit()
    {
        return this.#config.receive?.rateLimit?.limit ?? 10000;
    }

    static get smtpAuthLimitDuration()
    {
        return this.#config.receive?.authLimit?.duration ?? 60;
    }

    static get smtpAuthLimitLimit()
    {
        return this.#config.receive?.authLimit?.limit ?? 10;
    }

    static get httpProxyHost()
    {
        return this.#config.httpProxy?.host;
    }

    static get httpProxyPort()
    {
        return this.#config.httpProxy?.port;
    }

    static get httpProxyProtocol(): Required<Required<IConfig>['httpProxy']>['protocol']
    {
        return this.#config.httpProxy?.protocol ?? 'http';
    }

    static get httpProxyUsername()
    {
        return this.#config.httpProxy?.username;
    }

    static get httpProxyPassword()
    {
        return this.#config.httpProxy?.username;
    }

    static get httpProxyConfig(): AxiosProxyConfig | undefined
    {
        if(this.httpProxyHost && this.httpProxyPort)
        {
            return {
                host: Config.httpProxyHost!,
                port: Config.httpProxyPort!,
                protocol: Config.httpProxyProtocol,
                auth: (Config.httpProxyUsername && Config.httpProxyPassword)?{
                    username: Config.httpProxyUsername,
                    password: Config.httpProxyPassword,
                }:undefined,
            };
        }
    }

    /** Check if an IP address is allowed to connect */
    static isIpAllowed(clientIp: string): boolean
    {
        if(!this.#config.receive?.ipWhitelist) // Setting is undefined? Then all addresses are allowed
            return true;
        else
        {
            for(const whitelisted of this.#config.receive?.ipWhitelist)
            {
                if(IPCIDR.isValidCIDR(whitelisted)) // It's a CIDR?
                {
                    const cidr = new IPCIDR(whitelisted);
                    if(cidr.contains(clientIp))
                        return true;
                }
                else if(whitelisted === clientIp)
                    return true;
            }
        }

        return false;
    }

    /** Check if a FROM address is allowed */
    static isFromAllowed(from: string, username?: string): boolean
    {
        const userAllowed = username?this.#config.receive?.users?.find(user=>user.username===username)?.allowedFrom:undefined;

        if(userAllowed) // There are user specific allowed rules?
            return userAllowed.some(allowed=>allowed.toLowerCase()===from.toLowerCase());
        if(!this.#config.receive?.allowedFrom) // Setting is undefined? Then all addresses are allowed
            return true;
        else
            return this.#config.receive.allowedFrom.some(allowed=>allowed.toLowerCase()===from.toLowerCase());
    }

    static isUserAllowed(username: string, password: string): boolean
    {
        return Boolean(this.#config.receive?.users?.some(user=>(user.username===username && user.password===password)));
    }

    static get #config(): IConfig
    {
        if(this.#configData === undefined) // We need to load the config first?
        {
            const configFileArgs = process.argv.find(arg=>arg.startsWith('--config=') && arg.length > 9);
            const configFile = configFileArgs?configFileArgs.substring(9):'config.yml';

            try {
                const data = fs.readFileSync(configFile);
                try {
                    this.#configData = parseYaml(data.toString('utf-8'));
                } catch(error: any) {
                    throw `Failed to parse YAML: ${String(error)}`;
                }
            } catch(error: any) {
                throw new Error(`Unable to read config file "${configFile}". ${String(error)}`);
            }
        }

        return this.#configData!;
    }

    /** Get config value from CLI argument */
    static getConfigArg(key: string, type: 'string'): string|undefined;
    static getConfigArg(key: string, type: 'number'): number|undefined;
    static getConfigArg(key: string, type: 'number'|'string'): number|string|undefined
    {
        key = key.toLowerCase();
        const arg = process.argv.find(f=>f.toLowerCase().startsWith(`--${key}`));
        
        const value: string|undefined = arg?.split('=')[1];
        if(value === undefined) return undefined;

        if(type === 'number') // Get the number value
        {
            if(value !== '' && !isNaN(value as any))
                return Number(value);
        }
        else if(type === 'string') // Get the string value
            return value;
    }

}
