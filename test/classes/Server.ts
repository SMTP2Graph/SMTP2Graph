import fs from 'fs';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { stringify } from 'yaml';
import type { IConfig } from '../../src/classes/Config';
import { defaultTransportOptions } from '../01receive/Helpers';

export class Server
{
    #serverFile = process.argv.find(f=>f.startsWith('--serverFile='))?.substring(13) || 'dist/server.js';
    #configFile = 'testconfig.yml';
    #proc: ChildProcessWithoutNullStreams | undefined;

    static async start(config: IConfig, timeout?: number): Promise<Server>
    {
        const server = new Server(config);
        server.start(timeout);
        return server;
    }

    /**
     * @param config Config written to a config file. When undefined, no config file is used (configure the server through `env` instead)
     * @param env Additional (SMTP2GRAPH_*) environment variables for the server process
     */
    constructor(public config?: IConfig, public env?: Record<string, string>)
    {

    }

    start(timeout: number = 5000): Promise<void>
    {
        const args: string[] = [];

        if(this.config)
        {
            // Apply default port from our transport options
            if(!this.config.receive?.port) this.config = {...this.config, receive: {...this.config.receive, port: defaultTransportOptions.port}};

            // Create config file
            try {
                fs.writeFileSync(this.#configFile, stringify(this.config));
            } catch(error) {
                throw new Error(`Failed to created config file. ${String(error)}`);
            }

            args.push(`--config=${this.#configFile}`);
        }
        else if(!this.env?.SMTP2GRAPH_RECEIVE_PORT) // Apply default port from our transport options
            this.env = {...this.env, SMTP2GRAPH_RECEIVE_PORT: String(defaultTransportOptions.port)};

        const env = {...process.env, ...this.env};

        // Start the server
        return new Promise<void>((resolve, reject)=>{
            if(this.#serverFile.endsWith('.js'))
                this.#proc = spawn('node', [this.#serverFile, ...args], {env});
            else // We're testing a binary file?
                this.#proc = spawn(this.#serverFile, args, {env});
            let errorStr: string = '';

            const onTimeout = ()=>{
                detachListeners();
                reject(new Error(`A timeout occured (${timeout}ms)`));
            };
            const timeoutHandle = setTimeout(onTimeout, timeout);

            const onData = (data: Buffer)=>{
                if(data.toString().includes('Server started'))
                {
                    detachListeners();
                    this.#proc?.on('exit', ()=>{
                        this.#proc = undefined;
                    });
                    resolve();
                }
            };

            const onErrorData = (data: Buffer)=>{
                errorStr += data.toString();
            };

            const onError = (error: Error)=>{
                detachListeners();
                reject(error);
            };

            const onExit = ()=>{
                detachListeners();
                if(errorStr) reject(errorStr);
            };

            const detachListeners = ()=>{
                this.#proc?.stdout.off('data', onData);
                this.#proc?.stderr.off('data', onErrorData);
                this.#proc?.off('error', onError);
                this.#proc?.off('exit', onExit);
                clearTimeout(timeoutHandle);
            };

            this.#proc.stdout.on('data', onData);
            this.#proc.stderr.on('data', onErrorData);
            this.#proc.on('error', onError);
            this.#proc.on('exit', onExit);
        });
    }

    async stop(): Promise<void>
    {
        await new Promise<void>((resolve, reject)=>{
            if(this.#proc)
            {
                const onError = ()=>{
                    detachListeners();
                    reject();
                };

                const onExit = ()=>{
                    detachListeners();
                    resolve();
                };

                const detachListeners = ()=>{
                    this.#proc?.off('error', onError);
                    this.#proc?.off('exit', onExit);
                };

                this.#proc.on('error', onError);
                this.#proc.on('exit', onExit);
                this.#proc.kill('SIGINT');
            }
            else
                resolve();
        });

        try {
            if(fs.existsSync(this.#configFile)) fs.unlinkSync(this.#configFile);
        } catch(error) {
            console.error(`Failed to delete test config file "${this.#configFile}"`);
        }
    }

    async restart(additionalConfig?: Partial<IConfig>, additionalEnv?: Record<string, string>): Promise<void>
    {
        // Stop the currently running server
        try {
            await this.stop();
        } catch(error) {
            throw new Error(`Failed to stop server. ${String(error)}`);
        }

        // Modify config
        if(additionalConfig) this.config = {...this.config, ...additionalConfig} as IConfig;
        if(additionalEnv) this.env = {...this.env, ...additionalEnv};

        // Start a new server
        try {
            await this.start();
        } catch(error) {
            throw new Error(`Failed to start server. ${String(error)}`);
        }
    }

}
