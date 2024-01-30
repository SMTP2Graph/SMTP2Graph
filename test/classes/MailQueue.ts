import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import { simpleParser } from 'mailparser';

export class MailQueue
{
    static #queueDir = path.join('mailroot', 'queue');

    static startWaitForFile()
    {
        let filePath: string | undefined, error: any;
        let watcher = chokidar.watch(path.join(this.#queueDir, '*.eml'), {ignoreInitial: true});
        watcher.on('error', err=>{
            error = err;
            watcher.close();
        });
        watcher.on('add', path=>{
            filePath = path;
            watcher.close();
        });

        return async function(timeout = 2000): Promise<string>
        {
            if(filePath)
                return filePath;
            else if(error)
                throw error;
            else
            {
                return new Promise<string>((resolve, reject)=>{
                    const timeoutHandle = setTimeout(() => {
                        watcher.close();
                        reject(new Error('A timeout occured waiting for new file'));
                    }, timeout);

                    watcher.on('error', err=>{
                        clearTimeout(timeoutHandle);
                        watcher.close();
                        reject(err);
                    });
                    watcher.on('add', path=>{
                        clearTimeout(timeoutHandle);
                        watcher.close();
                        resolve(path);
                    });
                });
            }
        }
    }

    static async readFile(path: string, keepFile = false)
    {
        const parsed = await simpleParser(fs.readFileSync(path));

        if(!keepFile)
            fs.unlinkSync(path);
        
        return parsed;
    }
}
