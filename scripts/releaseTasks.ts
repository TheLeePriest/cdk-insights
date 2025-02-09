import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import axios from 'axios';

// Paths
const packageJsonPath = path.join(__dirname, '../package.json');
const changelogPath = path.join(__dirname, '../CHANGELOG.md');

// Utility function to execute shell commands with error handling
function runCommand(command: string, errorMessage: string): string {
  try {
    return execSync(command, { stdio: 'pipe' }).toString().trim();
  } catch (error) {
    console.error(`❌ ${errorMessage}:`, (error as Error).message);
    process.exit(1);
  }
}

// Check if required dependencies exist
function checkDependency(command: string, name: string): void {
  try {
    execSync(`command -v ${command}`, { stdio: 'ignore' });
  } catch {
    console.error(
      `❌ Missing dependency: ${name} (${command}). Please install it.`
    );
    process.exit(1);
  }
}

// Ensure git and npm are installed
checkDependency('git', 'Git');
checkDependency('npm', 'Node Package Manager');

// Parse CLI arguments
const args = process.argv.slice(2);
const releaseType = args.includes('--dry-run')
  ? 'dry-run'
  : args[0] || process.env.npm_config_type || 'patch';
const dryRun = args.includes('--dry-run');
const gitRemote =
  args.find((arg) => arg.startsWith('--remote='))?.split('=')[1] || 'origin';
const githubRepo =
  args.find((arg) => arg.startsWith('--repo='))?.split('=')[1] ||
  process.env.GITHUB_REPO;
const githubToken = process.env.GITHUB_TOKEN;

if (!['major', 'minor', 'patch', 'dry-run'].includes(releaseType)) {
  console.error("❌ Invalid release type. Use 'major', 'minor', or 'patch'.");
  process.exit(1);
}

// Read package.json and store the current state for rollback
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version;

console.log(`🔍 Current version: ${currentVersion}`);
console.log(`🔄 Bumping version (${releaseType})...`);

// Determine the new version manually, unless in dry-run mode
let newVersion = currentVersion;
if (!dryRun) {
  newVersion = runCommand(
    `npm version ${releaseType} --no-git-tag-version`,
    'Failed to update version'
  ).replace('v', '');
  packageJson.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
}

console.log(`✅ New version: ${newVersion}`);

// Get the last release tag
const lastTag = runCommand(
  'git describe --tags --abbrev=0',
  'Failed to get last version tag'
);

// Fetch commit messages since the last tag
const changes = runCommand(
  `git log --pretty=format:"- %s (%h)" ${lastTag}..HEAD`,
  'Failed to get commit history'
);

if (!changes) {
  console.warn('⚠️ No new commits since the last release.');
}

// Create changelog entry
const date = new Date().toISOString().split('T')[0];
const newEntry = `\n## [${newVersion}] - ${date} (${releaseType.toUpperCase()} RELEASE)\n\n${changes}\n\n`;

if (!dryRun) {
  // Update or create CHANGELOG.md
  if (fs.existsSync(changelogPath)) {
    fs.appendFileSync(changelogPath, newEntry);
  } else {
    fs.writeFileSync(changelogPath, `# Changelog\n${newEntry}`);
  }
  console.log('✅ Changelog updated!');
} else {
  console.log('🔍 [Dry Run] Changelog Preview:');
  console.log(newEntry);
}

// If dry-run mode, exit here
if (dryRun) {
  console.log('✅ Dry-run complete. No files modified.');
  process.exit(0);
}

// Commit changes
console.log('📌 Committing changes...');
try {
  runCommand('git add package.json CHANGELOG.md', 'Failed to stage files');
  runCommand(
    `git commit -m "chore(release): ${newVersion}"`,
    'Failed to commit changes'
  );
} catch (error) {
  console.error('❌ Commit failed, rolling back...');
  fs.writeFileSync(
    packageJsonPath,
    JSON.stringify({ ...packageJson, version: currentVersion }, null, 2)
  );
  process.exit(1);
}

// Create a tag and push
console.log('🏷️ Tagging release...');
runCommand(
  `git tag -a v${newVersion} -m "Release ${newVersion}"`,
  'Failed to tag the release'
);
runCommand(`git push ${gitRemote} --follow-tags`, 'Failed to push changes');

console.log('🚀 Publishing to NPM...');
runCommand('npm publish', 'Failed to publish package');

// **Optional GitHub Release Automation**
async function createGithubRelease() {
  if (!githubToken) {
    console.warn('⚠️ GITHUB_TOKEN is missing. Skipping GitHub release.');
    return;
  }

  if (!githubRepo) {
    console.warn(
      '⚠️ GitHub repository not specified. Use --repo=username/repo.'
    );
    return;
  }

  console.log(`📢 Creating GitHub Release for v${newVersion}...`);

  const releaseData = {
    tag_name: `v${newVersion}`,
    name: `Release ${newVersion}`,
    body: newEntry.trim(),
    draft: false,
    prerelease: false,
  };

  try {
    const response = await axios.post(
      `https://api.github.com/repos/${githubRepo}/releases`,
      releaseData,
      {
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );
    console.log('✅ GitHub Release created:', response.data.html_url);
  } catch (error) {
    console.error(
      '❌ Failed to create GitHub Release:',
      (error as Error).message
    );
  }
}

// Call GitHub release function if token is provided
createGithubRelease();

console.log('🎉 Successfully published version', newVersion);
