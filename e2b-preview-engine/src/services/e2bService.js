import { Sandbox } from '@e2b/code-interpreter';

class E2BService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.activeSandboxes = new Map();
    console.log('E2BService initialized with API key present:', !!apiKey);
  }

  async createPreviewSession(files, startCommand = 'npm run dev') {
    console.log('Creating preview session with API key length:', this.apiKey?.length);

    const templates = ['nodejs', 'node-18', 'node', 'base', 'ubuntu'];
    let lastError;

    for (const template of templates) {
      try {
        console.log(`Trying template: ${template}`);
        const sandbox = await Sandbox.create({
          apiKey: this.apiKey,
          template: template,
          timeoutMs: 10 * 60 * 1000,
        });
        if (sandbox && sandbox.files) {
          console.log(`✅ Template ${template} succeeded`);

          // Write all files
          for (const [filePath, content] of Object.entries(files)) {
            await sandbox.files.write(filePath, content);
          }

          // Only run npm install if package.json exists
          const hasPackageJson = Object.keys(files).some(path => path.endsWith('package.json'));
          let installResult = { stdout: '', stderr: '' };
          if (hasPackageJson) {
            console.log('Running npm install...');
            installResult = await sandbox.commands.run('npm install');
            if (installResult.exitCode !== 0) {
              throw new Error(`npm install failed: ${installResult.stderr}`);
            }
          } else {
            console.log('No package.json found, skipping npm install');
          }

          // Run the start command and capture its output
          console.log(`Running start command: ${startCommand}`);
          const startResult = await sandbox.commands.run(startCommand);
          
          // If the start command exited immediately with an error, throw
          if (startResult.exitCode !== 0) {
            throw new Error(`Start command failed (code ${startResult.exitCode}): ${startResult.stderr}`);
          }

          // Construct preview URL (hardcoded port – adjust if needed)
          const previewUrl = `https://${5173}-${sandbox.sandboxId}.e2b.app`;
          this.activeSandboxes.set(sandbox.sandboxId, { sandbox, createdAt: new Date(), previewUrl });

          return {
            sessionId: sandbox.sandboxId,
            previewUrl,
            logs: { stdout: installResult.stdout, stderr: installResult.stderr }
          };
        } else {
          console.log(`Template ${template} returned sandbox without filesystem`, sandbox);
        }
      } catch (err) {
        console.error(`Template ${template} failed – full error:`, err);
        lastError = err;
      }
    }
    throw new Error(`All templates failed. Last error: ${lastError?.message || 'unknown'}. See server logs for details.`);
  }

  async stopSession(sessionId) {
    const session = this.activeSandboxes.get(sessionId);
    if (session) {
      await session.sandbox.kill();
      this.activeSandboxes.delete(sessionId);
      return true;
    }
    return false;
  }

  getActiveSessions() {
    return Array.from(this.activeSandboxes.entries()).map(([id, data]) => ({
      id,
      previewUrl: data.previewUrl,
      createdAt: data.createdAt
    }));
  }
}

export default E2BService;
