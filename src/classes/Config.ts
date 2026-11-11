import fs from 'fs';
import { parse as parseYaml } from 'yaml';
import IPCIDR from 'ip-cidr';
import type { AxiosProxyConfig } from 'axios';

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

export function axiosProxyConfig(config: IConfig['httpProxy']): AxiosProxyConfig | undefined
{
    if(!config?.host || !config.port) return undefined;

    return {
        host: config.host,
        port: config.port,
        protocol: config.protocol ?? 'http',
        auth: (config.username && config.password)?{
            username: config.username,
            password: config.password,
        }:undefined,
    };
}

export class InvalidConfig extends Error { }

/** Prefix for all environment variables that can be used to configure SMTP2Graph */
const ENV_PREFIX = 'SMTP2GRAPH_';

type EnvValueType = 'string'|'number'|'boolean'|'list';

/** Environment variables that can be used instead of (or on top of) the config file. Values from the environment take precedence */
const envMappings: {env: string, path: string, type: EnvValueType}[] = [
    {env: 'MODE', path: 'mode', type: 'string'},
    {env: 'SEND_APPREG_TENANT', path: 'send.appReg.tenant', type: 'string'},
    {env: 'SEND_APPREG_ID', path: 'send.appReg.id', type: 'string'},
    {env: 'SEND_APPREG_SECRET', path: 'send.appReg.secret', type: 'string'},
    {env: 'SEND_APPREG_CERTIFICATE_THUMBPRINT', path: 'send.appReg.certificate.thumbprint', type: 'string'},
    {env: 'SEND_APPREG_CERTIFICATE_PRIVATEKEYPATH', path: 'send.appReg.certificate.privateKeyPath', type: 'string'},
    {env: 'SEND_RETRYLIMIT', path: 'send.retryLimit', type: 'number'},
    {env: 'SEND_RETRYINTERVAL', path: 'send.retryInterval', type: 'number'},
    {env: 'SEND_FORCEMAILBOX', path: 'send.forceMailbox', type: 'string'},
    {env: 'RECEIVE_PORT', path: 'receive.port', type: 'number'},
    {env: 'RECEIVE_LISTENADDRESS', path: 'receive.listenAddress', type: 'string'},
    {env: 'RECEIVE_SECURE', path: 'receive.secure', type: 'boolean'},
    {env: 'RECEIVE_TLSKEYPATH', path: 'receive.tlsKeyPath', type: 'string'},
    {env: 'RECEIVE_TLSCERTPATH', path: 'receive.tlsCertPath', type: 'string'},
    {env: 'RECEIVE_MAXSIZE', path: 'receive.maxSize', type: 'string'},
    {env: 'RECEIVE_BANNER', path: 'receive.banner', type: 'string'},
    {env: 'RECEIVE_IPWHITELIST', path: 'receive.ipWhitelist', type: 'list'},
    {env: 'RECEIVE_ALLOWEDFROM', path: 'receive.allowedFrom', type: 'list'},
    {env: 'RECEIVE_ALLOWINSECUREAUTH', path: 'receive.allowInsecureAuth', type: 'boolean'},
    {env: 'RECEIVE_REQUIREAUTH', path: 'receive.requireAuth', type: 'boolean'},
    {env: 'RECEIVE_RATELIMIT_DURATION', path: 'receive.rateLimit.duration', type: 'number'},
    {env: 'RECEIVE_RATELIMIT_LIMIT', path: 'receive.rateLimit.limit', type: 'number'},
    {env: 'RECEIVE_AUTHLIMIT_DURATION', path: 'receive.authLimit.duration', type: 'number'},
    {env: 'RECEIVE_AUTHLIMIT_LIMIT', path: 'receive.authLimit.limit', type: 'number'},
    {env: 'HTTPPROXY_HOST', path: 'httpProxy.host', type: 'string'},
    {env: 'HTTPPROXY_PORT', path: 'httpProxy.port', type: 'number'},
    {env: 'HTTPPROXY_PROTOCOL', path: 'httpProxy.protocol', type: 'string'},
    {env: 'HTTPPROXY_USERNAME', path: 'httpProxy.username', type: 'string'},
    {env: 'HTTPPROXY_PASSWORD', path: 'httpProxy.password', type: 'string'},
];

export class Config
{
    static #configData: IConfig | undefined;

    /** Check if the config file is valid */
    static validate()
    {
        const isStringValue = (val: any)=>{
            return (typeof val === 'string' && val);
        };

        if(typeof (this.#config.mode ?? 'full') !== 'string' || !['full','receive','send'].includes(this.mode))
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
        return (this.#config.mode ?? 'full').toLowerCase() as IConfig['mode'];
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
        return this.#config.httpProxy?.password;
    }

    static get httpProxyConfig(): AxiosProxyConfig | undefined
    {
        return axiosProxyConfig(this.#config.httpProxy);
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
            let fileConfig: IConfig | undefined;

            // The config file is optional when environment variables are used, unless it was explicitly specified
            if(configFileArgs || fs.existsSync(configFile))
            {
                try {
                    const data = fs.readFileSync(configFile);
                    try {
                        fileConfig = parseYaml(data.toString('utf-8')) ?? {};
                    } catch(error: any) {
                        throw `Failed to parse YAML: ${String(error)}`;
                    }
                } catch(error: any) {
                    throw new Error(`Unable to read config file "${configFile}". ${String(error)}`);
                }
            }

            const { config, applied } = this.#applyEnv(fileConfig ?? {} as IConfig);
            if(!fileConfig && !applied)
                throw new Error(`Config file "${configFile}" not found and no ${ENV_PREFIX}* environment variables are set`);

            this.#configData = config;
        }

        return this.#configData!;
    }

    /** Apply SMTP2GRAPH_* environment variables on top of the given config */
    static #applyEnv(config: IConfig): {config: IConfig, applied: boolean}
    {
        let applied = false;

        const setPath = (path: string, value: any)=>{
            const keys = path.split('.');
            let obj: any = config;
            for(const key of keys.slice(0, -1))
            {
                if(typeof obj[key] !== 'object' || obj[key] === null) obj[key] = {};
                obj = obj[key];
            }
            obj[keys[keys.length-1]] = value;
            applied = true;
        };

        for(const mapping of envMappings)
        {
            const envName = ENV_PREFIX+mapping.env;
            const raw = process.env[envName];
            if(raw === undefined || raw === '') continue;

            setPath(mapping.path, this.#parseEnvValue(envName, raw, mapping.type));
        }

        // SMTP users are defined as SMTP2GRAPH_RECEIVE_USERS_<n>_USERNAME, _PASSWORD and _ALLOWEDFROM
        const userRegex = new RegExp(`^${ENV_PREFIX}RECEIVE_USERS_(\\d+)_(USERNAME|PASSWORD|ALLOWEDFROM)$`, 'i');
        const users = new Map<number, {username?: string, password?: string, allowedFrom?: string[]}>();
        for(const [envName, raw] of Object.entries(process.env))
        {
            const matches = userRegex.exec(envName);
            if(!matches || raw === undefined || raw === '') continue;

            const index = Number(matches[1]);
            const user = users.get(index) ?? {};
            const field = matches[2].toUpperCase();
            if(field === 'USERNAME') user.username = raw;
            else if(field === 'PASSWORD') user.password = raw;
            else user.allowedFrom = this.#parseEnvValue(envName, raw, 'list') as string[];
            users.set(index, user);
        }

        if(users.size)
        {
            const userList = [...users.entries()].sort(([a], [b])=>a-b).map(([index, user])=>{
                if(!user.username || !user.password)
                    throw new InvalidConfig(`Environment variables ${ENV_PREFIX}RECEIVE_USERS_${index}_USERNAME and ${ENV_PREFIX}RECEIVE_USERS_${index}_PASSWORD are both required`);
                return user as {username: string, password: string, allowedFrom?: string[]};
            });
            setPath('receive.users', userList);
        }

        return {config, applied};
    }

    /** Convert the string value of an environment variable to the desired type */
    static #parseEnvValue(envName: string, raw: string, type: EnvValueType): string|number|boolean|string[]
    {
        if(type === 'number')
        {
            const value = raw.trim();
            if(value === '' || isNaN(value as any))
                throw new InvalidConfig(`Environment variable ${envName} should be a number`);
            return Number(value);
        }
        else if(type === 'boolean')
        {
            const value = raw.trim().toLowerCase();
            if(['true','1','yes','on'].includes(value)) return true;
            else if(['false','0','no','off'].includes(value)) return false;
            throw new InvalidConfig(`Environment variable ${envName} should be a boolean (true/false)`);
        }
        else if(type === 'list') // Comma separated list
            return raw.split(',').map(item=>item.trim()).filter(item=>item);
        else
            return raw;
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
