import fs from 'fs';
import { spawn } from 'child_process';
import { expect } from 'chai';
import '../_config';

describe('Receive: Configuration', function(){
    const configFile = 'testconfig-malformed.yml';
    const serverFile = process.argv.find(f=>f.startsWith('--serverFile='))?.substring(13) || 'dist/server.js';

    afterEach('Remove malformed config', function(){
        if(fs.existsSync(configFile)) fs.unlinkSync(configFile);
    });

    it('Rejects malformed YAML', async function(){
        fs.writeFileSync(configFile, 'mode: receive\nreceive: [');

        const result = await new Promise<{code: number|null, output: string}>((resolve, reject)=>{
            const proc = serverFile.endsWith('.js')
                ? spawn('node', [serverFile, `--config=${configFile}`])
                : spawn(serverFile, [`--config=${configFile}`]);
            let output = '';

            proc.stdout.on('data', data=>output += data.toString());
            proc.stderr.on('data', data=>output += data.toString());
            proc.on('error', reject);
            proc.on('close', code=>resolve({code, output}));
        });

        expect(result.code).to.equal(1);
        expect(result.output).to.match(/Failed to parse YAML/);
    });
});
