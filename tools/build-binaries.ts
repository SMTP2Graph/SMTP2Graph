import fs from 'fs';
import path from 'path';
import { exec, ExecOptions } from 'child_process';
import rcedit from 'rcedit';
import { Arch, downloadBinary, findVersion, Platform, Version } from './nodejs-downloader';

const distNodeVersion = '20';
const distributions: {platform: Platform, arch: Arch}[] = [
    {platform: 'win', arch: 'x64'},
    {platform: 'linux', arch: 'x64'},
];
const outDir = 'dist';
const binNamePrefix = 'smtp2graph';

(async ()=>{
    console.log('Bundling scripts...');
    try {
        await runCommand('npm run build');
    } catch(error) {
        console.error('Failed to bundle.', error);
        return;
    }

    // Generate SEA blob
    console.log('Generating SEA blob...');
    try {
        await runCommand('node --experimental-sea-config tools/sea-config.json');
    } catch(error) {
        console.error('Failed to generate blob.', error);
        return;
    }

    for(const dist of distributions)
    {
        console.log(`Starting build for ${dist.platform} ${dist.arch}`);
        
        // Look for suitable version
        let nodeVersion: Version|undefined;
        try {
            nodeVersion = await findVersion(distNodeVersion, dist.platform, dist.arch);
            if(!nodeVersion) throw new Error('No suitable version was found');
        } catch(error) {
            console.error(`Failed to find NodeJs version for ${dist.platform} ${dist.arch}.`, error);
            continue;
        }

        // Download the NodeJs binary
        console.log(`Downloading NodeJs binary ${nodeVersion.version}...`);
        const targetFile = path.join(outDir, `${binNamePrefix}-${dist.platform}-${dist.arch}${dist.platform==='win'?'.exe':''}`);
        try {
            const binPath = await downloadBinary(nodeVersion, dist.platform, dist.arch);
            fs.renameSync(binPath, targetFile);
        } catch(error) {
            console.error('Failed to download NodeJs binary.', error);
            continue;
        }

        // Apply binary properties in case of Windows build
        if(dist.platform === 'win')
        {
            console.log('Settings .exe properties...');
            try {
                const packageJson = require('../package.json');
                await rcedit(targetFile, {
                    'version-string': {
                        CompanyName: packageJson.author,
                        FileDescription: packageJson.description,
                        ProductName: 'SMTP2Graph',
                        OriginalFilename: path.basename(targetFile),
                        LegalCopyright: `Copyright SMTP2Graph contributors. ${packageJson.license} license`,
                    },
                    'file-version': packageJson.version,
                    'product-version': packageJson.version,
                    icon: path.resolve(path.join('tools', 'SMTP2Graph.ico')),
                });
            } catch(error) {
                console.error('Failed to set .exe properties', error);
                fs.unlinkSync(targetFile);
                continue;
            }
        }

        // Compile our distribution
        console.log(`Compiling binary for ${dist.platform} ${dist.arch}`);
        try {
            await runCommand(`npx --yes postject ${targetFile} NODE_SEA_BLOB dist/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`);
        } catch(error) {
            console.error('Something went wrong', error);
            fs.unlinkSync(targetFile);
            continue;
        }
    }
})();

async function runCommand(command: string, options?: ExecOptions, showOutput?: boolean)
{
    await new Promise<void>((resolve, reject)=>{
        exec(command, options, (error, stdout, stderr)=>{
            if(showOutput)
            {
                console.log(stdout);
                console.error(stderr);
            }

            if(error)
                reject(stderr || error);
            else
                resolve();
        });
    });
}
