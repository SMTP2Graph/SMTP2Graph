import fs from 'fs';
import path from 'path';
import https from 'https';
import zlib from 'zlib';
import tar from 'tar';

const mainUrl = 'https://nodejs.org/dist';

export type Platform = 'win'|'linux';
export type Arch = 'x64'|'x86'|'arm64';

export interface Version
{
    version: `v${string}`;
    date: string;
    files: string[];
    lts: string|false;
}

let nodeVersions: Version[]|undefined;
export async function findVersion(version: string, platform: Platform, arch: Arch)
{
    // Download releases index
    nodeVersions ??= await new Promise((resolve, reject)=>{
        let data = '';
        https.get(`${mainUrl}/index.json`, res=>{
            res.on('data', chunk=>{
                data += chunk;
            })
            .on('error', reject)
            .on('end', ()=>{
                try {
                    resolve(JSON.parse(data));
                } catch(error) {
                    reject(error);
                }
            });
        });
    });

    // Find the version we're looking for
    for(const release of nodeVersions!)
    {
        if(release.version.startsWith(`v${version}`)) // We found the latest version that matched our requested version
        {
            for(const file of release.files) // See if it contains the file we're looking for
            {
                if(file.startsWith(`${platform}-${arch}`))
                    return release;
            }
        }
    }
}

export async function getDownloadUrl(versionInfo: Version, platform: Platform, arch: Arch)
{
    if(platform === 'win')
        return `${mainUrl}/${versionInfo.version}/${platform}-${arch}/node.exe`;
    else if(platform === 'linux')
        return `${mainUrl}/${versionInfo.version}/node-${versionInfo.version}-${platform}-${arch}.tar.gz`;
    else
        throw new Error(`Unsupported platform "${platform}"`);
}

export async function downloadBinary(versionInfo: Version, platform: Platform, arch: Arch): Promise<string>
{
    const downloadUrl = await getDownloadUrl(versionInfo, platform, arch);
    let filename = path.basename(downloadUrl);
    if(filename.endsWith('.exe')) filename = `node-${versionInfo.version}-${platform}-${arch}.exe`; // Create a more recognizable name for Windows executables

    try {
        await downloadFile(downloadUrl, filename);
    } catch(error) {
        throw new Error(`Failed to download file "${downloadUrl}". ${String(error)}`);
    }

    if(filename.endsWith('.exe')) // When we got an .exe, we're done
        return filename;
    else if(filename.endsWith('.tar.gz')) // We have to extract the binary?
    {
        try {
            const targetFile = `node-${versionInfo.version}-${platform}-${arch}`;
            await extractBinaryFromTarGz(filename, targetFile);
            return targetFile;
        } finally {
            fs.unlinkSync(filename); // Delete the archive
        }
    }
    else
    {
        fs.unlinkSync(filename);
        throw new Error(`Unexpected filetype for "${filename}"`);
    }
}

export async function extractBinaryFromTarGz(tarGzfile: string, targetFile: string)
{
    return new Promise<void>((resolve, reject)=>{
        fs.createReadStream(tarGzfile)
            .on('error', reject)
            .pipe(zlib.createGunzip())
            .on('error', reject)
            .pipe(tar.t({
                filter: (name, stat)=>(path.basename(name)==='node' && stat.size>10485760), // Did we encounter a file called "node" that's larger than 10MB?
                onentry: (entry)=>{
                    entry.pipe(fs.createWriteStream(targetFile))
                        .on('error', reject)
                        .on('finish', resolve);
                },
            }));
    });
}

export async function downloadFile(url: string, targetFile: string)
{
    return new Promise<void>((resolve, reject)=>{
        const file = fs.createWriteStream(targetFile);
        https.get(url, res=>{
            res.pipe(file)
            .on('error', reject)
            .on('close', resolve);
        });
    });
}
