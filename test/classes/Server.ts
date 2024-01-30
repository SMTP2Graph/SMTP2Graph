import fs from 'fs';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { stringify } from 'yaml';
import type { IConfig } from '../../src/classes/Config';

export class Server
{
    #serverFile = 'dist/server.js';
    #configFile = 'testconfig.yml';
    #proc: ChildProcessWithoutNullStreams | undefined;

    static async start(config: IConfig, timeout?: number): Promise<Server>
    {
        const server = new Server(config);
        server.start(timeout);
        return server;
    }

    constructor(public config: IConfig)
    {

    }

    start(timeout: number = 5000): Promise<void>
    {
        // Create config file
        try {
            fs.writeFileSync(this.#configFile, stringify(this.config));
        } catch(error) {
            throw new Error(`Failed to created config file. ${String(error)}`);
        }

        // Start the server
        return new Promise<void>((resolve, reject)=>{
            this.#proc = spawn('node', [this.#serverFile, `--config=${this.#configFile}`]);
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

    async restart(additionalConfig?: Partial<IConfig>): Promise<void>
    {
        // Stop the currently running server
        try {
            await this.stop();
        } catch(error) {
            throw new Error(`Failed to stop server. ${String(error)}`);
        }

        // Modify config
        this.config = {...this.config, ...additionalConfig};

        // Start a new server
        try {
            await this.start();
        } catch(error) {
            throw new Error(`Failed to start server. ${String(error)}`);
        }
    }

}
