import path from 'path';
import winston from 'winston';

export interface ILogMeta extends Record<string, any>
{
    error?: any;
}

const logsDir = 'logs';

const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
    winston.format.printf((info: any)=>`[${info.timestamp}] [${info.level}]: ${info.message}`),
);

const logger = winston.createLogger({
    level: DEBUG?'verbose':'info',
    format: winston.format.combine(
        winston.format.timestamp({format: 'isoDateTime'}),
        winston.format.json(),
    ),
    transports: [
        new winston.transports.File({filename: path.join(logsDir, 'error.log'), level: 'error', maxsize: 2*1024*1024, maxFiles: 10}),
        new winston.transports.File({filename: path.join(logsDir, 'combined.log'), level: 'info', maxsize: 2*1024*1024, maxFiles: 10}),
        new winston.transports.Console({format: consoleFormat, stderrLevels: ['error']}),
    ],
    exceptionHandlers: [
        new winston.transports.File({filename: path.join(logsDir, 'exceptions.log'), maxsize: 2*1024*1024, maxFiles: 10}),
        new winston.transports.Console({format: consoleFormat}),
    ],
});


export function log(level: 'verbose'|'info'|'warn', msg: string, meta?: ILogMeta): Promise<void>;
export function log(level: 'error', msg: string, meta: Required<ILogMeta>): Promise<void>;
export function log(level: 'verbose'|'info'|'warn'|'error', msg: string, meta?: ILogMeta): Promise<void>
{
    if(meta?.error instanceof Error)
    {
        meta.name = meta.error.name;
        meta.stack = meta.error.stack;
        meta.error = meta.error.message;
    }

    return new Promise<void>((resolve, reject)=>{
        logger.log(level, msg, meta, (err)=>{
            if(err)
                console.error('An error occured while logging!', err);
            else if(DEBUG && meta)
                console.error(meta); // Output metadata when in DEBUG mode
            
            resolve();
        });
    });
}

/** Create a `log()` function, but prefix the `msg` with `[prefix] ` */
export function prefixedLog(prefix: string): typeof log
{
    return function(level, msg, meta)
    {
        return log(level as any, `[${prefix}] ${msg}`, meta);
    };
}
