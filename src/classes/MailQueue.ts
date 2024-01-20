import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import { Mutex } from 'async-mutex';
import { Mailer } from './Mailer';
import { prefixedLog } from './Logger';
import { Config } from './Config';
import { UnrecoverableError } from './Constants';

const log = prefixedLog('MailQueue');

export class MailQueue
{
    /** While true, no files from the queue folder will be processed */
    #paused = false;
    #rootPath: string;
    #tempPath: string;
    #queuePath: string;
    #failedPath: string;
    #watcher: chokidar.FSWatcher|undefined;
    /** Remember mails to retry. Key = filename */
    #retryQueue = new Map<string, {retryAfter: Date, retryCount: number}>();
    #retryQueueInterval: NodeJS.Timeout|undefined;
    /** Prevent multiple retries from running simultaneous */
    #retryMutex = new Mutex();

    /**
     * Create a mail queue
     * @param rootPath Path where the queue, temp and failed folders are located/created
     */
    constructor(rootPath: string = 'mailroot')
    {
        this.#paused = Config.mode === 'receive';
        this.#rootPath = rootPath;
        this.#tempPath = path.join(rootPath, 'temp');
        this.#queuePath = path.join(rootPath, 'queue');
        this.#failedPath = path.join(rootPath, 'failed');
        this.#ensureFolderStructure();
        this.#startWatcher();
    }

    get tempPath(): string
    {
        return this.#tempPath;
    }

    #startWatcher()
    {
        if(this.#paused) return; // Don't start the watcher when it's paused

        this.#watcher = chokidar.watch(path.join(this.#queuePath, '*.eml'));
        this.#watcher.on('error', (error)=>{
            log('error', `An error occured watching the queue folder`, {error});
        });
        this.#watcher.on('add', this.#onFileAdded.bind(this));
    }

    async #onFileAdded(filePath: string)
    {
        const filename = path.basename(filePath);
        log('verbose', `File "${filename}" appeared in the queue`);
        
        try {
            await Mailer.sendEml(filePath);
            this.remove(filePath);
            this.#removeFromRetryQueue(filename);
        } catch(error) {
            log('error', `Failed to send message "${filename}"`, {error, filename});
            if(!(error instanceof UnrecoverableError))
                this.#addToRetryQueue(filename);
        }
    }

    #addToRetryQueue(filename: string)
    {
        if(Config.sendRetryLimit) // Retrying is enabled?
        {
            const data = this.#retryQueue.get(filename);
            if(data && data.retryCount >= Config.sendRetryLimit) // This file is already in the queue and exceeded the retry limit?
            {
                try {
                    this.#retryQueue.delete(filename); // Remove from queue
                    fs.renameSync(path.join(this.#queuePath, filename), path.join(this.#failedPath, filename)); // Move to failed dir
                } catch(error) {
                    log('error', `Error moving file "${filename}" from queue to failed dir`, {error, filename});
                }
            }
            else // This file should be retried
            {
                const retryAfter = new Date();
                retryAfter.setMinutes(retryAfter.getMinutes()+Config.sendRetryInterval);
                this.#retryQueue.set(filename, {retryAfter, retryCount: (data?.retryCount || 0)+1});
            }

            // Start/stop the queue if necessary
            this.#startStopRetryQueue();
        }
    }

    #removeFromRetryQueue(filename: string)
    {
        if(this.#retryQueue.has(filename)) // Was this file in the retry queue?
        {
            this.#retryQueue.delete(filename);
            this.#startStopRetryQueue(); // Stop the queue if it's empty
        }
    }

    /** Start the retry queue if it's not already started and it's not empty */
    #startStopRetryQueue()
    {
        if(!this.#retryQueueInterval && this.#retryQueue.size > 0) // The queue is not started, but there are items waiting?
            this.#retryQueueInterval = setInterval(this.#retry.bind(this), 30000); // Fire retry every 30 seconds
        else if(this.#retryQueueInterval && this.#retryQueue.size === 0) // The queue is started, but it's empty?
        {
            clearInterval(this.#retryQueueInterval);
            this.#retryQueueInterval = undefined;
        }
    }

    async #retry()
    {
        if(this.#retryQueue.size === 0) return;
        if(this.#retryMutex.isLocked()) return; // Skip if it's already retrying

        await this.#retryMutex.runExclusive(async ()=>{
            for(const [filename,data] of this.#retryQueue)
            {
                if(data.retryAfter.getTime() < Date.now()) // This item should be retried?
                    await this.#onFileAdded(path.join(this.#queuePath, filename));
            }
        });
    }

    add(filePath: string)
    {
        const filename = path.basename(filePath);
        try {
            fs.renameSync(filePath, path.join(this.#queuePath, filename));
            log('verbose', `Moved file "${filename}" to queue`);
        } catch(error) {
            log('error', `Error while moving "${filename}" to queue`, {error});
        }
    }

    remove(filePath: string)
    {
        try {
            fs.unlinkSync(filePath);
        } catch(error) {
            log('error', `Error while deleting "${filePath}" from queue`, {error});
        }
    }

    #ensureFolderStructure()
    {
        if(!this.#pathExists(this.#rootPath)?.isDirectory())
            fs.mkdirSync(this.#rootPath);

        if(!this.#pathExists(this.#tempPath)?.isDirectory())
            fs.mkdirSync(this.#tempPath);

        if(!this.#pathExists(this.#queuePath)?.isDirectory())
            fs.mkdirSync(this.#queuePath);

        if(!this.#pathExists(this.#failedPath)?.isDirectory())
            fs.mkdirSync(this.#failedPath);
    }

    #pathExists(path: string)
    {
        try {
            return fs.statSync(path);
        } catch(error: any) {
            if(!('code' in error) || error.code !== 'ENOENT')
                throw error;
        }
    }
}
