import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const directory = mkdtempSync(join(tmpdir(), 'smtp2graph-receive-tls-'));
export const tlsKeyPath = join(directory, 'localhost.key');
export const tlsCertPath = join(directory, 'localhost.crt');

execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '1',
    '-subj', '/CN=localhost', '-keyout', tlsKeyPath, '-out', tlsCertPath,
], { stdio: 'ignore' });

process.once('exit', () => rmSync(directory, { recursive: true, force: true }));
