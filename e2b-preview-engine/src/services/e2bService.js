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
      let sandbox;
      try {
        console.log(`Trying template: ${template}`);
        sandbox = await Sandbox.create({
          apiKey: this.apiKey,
          template: template,
          timeoutMs: 10 * 60 * 1000,
        });
        if (!sandbox || !sandbox.files) {
          console.log(`Template ${template} returned sandbox without filesystem`, sandbox);
          continue;
        }
        console.log(`✅ Template ${template} succeeded`);

        // Write files
        for (const [filePath, content] of Object.entries(files)) {
          await sandbox.files.write(filePath, content);
        }

        // Only run npm install if package.json exists
        const hasPackageJson = Object.keys(files).some(path => path.endsWith('package.json'));
        if (hasPackageJson) {
          console.log('Running npm install...');
          const install = await sandbox.commands.run('npm install');
          if (install.exitCode !== 0) {
            throw new Error(`npm install failed: ${install.stderr}`);
          }
        } else {
          console.log('No package.json found, skipping npm install');
        }

        // Start the process in background
        console.log(`Starting in background: ${startCommand}`);
        const proc = await sandbox.commands.run(startCommand, { background: true });

        // Wait a bit to see if the process exits immediately
        await new Promise(r => setTimeout(r, 2000));
        if (proc.exitCode !== null) {
          throw new Error(`Process exited early with code ${proc.exitCode}`);
        }

        // Determine expected port
        const port = startCommand.includes('vite') ? 5173 : 3000;

        // Wait up to 60 seconds for the server to start
        let ready = false;
        for (let i = 0; i < 60; i++) {
          await new Promise(r => setTimeout(r, 1000));
          try {
            const test = await fetch(`http://localhost:${port}`);
            if (test.ok) {
              ready = true;
              break;
            }
          } catch {
            // port not ready yet
          }
        }

        if (!ready) {
          throw new Error(`Server did not start within timeout on port ${port}.`);
        }

        const previewUrl = `https://${port}-${sandbox.sandboxId}.e2b.app`;
        this.activeSandboxes.set(sandbox.sandboxId, { sandbox, createdAt: new Date(), previewUrl });

        return {
          sessionId: sandbox.sandboxId,
          previewUrl,
          message: 'Preview created successfully'
        };
      } catch (err) {
        console.error(`Template ${template} failed:`, err);
        lastError = err;
        if (sandbox) await sandbox.kill().catch(() => {});
      }
    }
    throw new Error(`All templates failed. Last error: ${lastError?.message || 'unknown'}. See server logs.`);
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
