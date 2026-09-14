const { readFileSync } = require('node:fs');

const workflow = readFileSync('.github/workflows/release-ci.yml', 'utf8');
const fail = (message) => { throw new Error(`workflow policy: ${message}`); };

if (!workflow.includes("branches: [dev, main]") && !workflow.includes("branches: [dev]")) fail('PR and development push must target dev or main.');
if (!workflow.includes("tags: ['v*']")) fail('release path must require a version tag.');
if (/\bdeploy:\s*true\b/.test(workflow)) fail('build plane must never request deploy.');
if ((workflow.match(/shared-ci-cd\.yml@main/g) || []).length !== 3) fail('each PR/dev/tag path must use the shared CI/CD exception.');
for (const line of workflow.split('\n').filter((line) => line.includes('uses:'))) {
  if (!line.includes('mzhk-repo/shared-workflows/.github/workflows/shared-ci-cd.yml@main')) fail('build plane must not declare local Action/image uses.');
}
if (/:latest\b/.test(workflow) || /@v\d/.test(workflow)) fail('build plane must not retain mutable Action or image references.');
if (!workflow.includes('push_docker_image: true')) fail('development and tag paths must publish images.');
console.log('PASS: build-plane workflow policy is build-only and immutable.');
