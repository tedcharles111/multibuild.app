import { Sandbox } from '@e2b/code-interpreter';

class E2BService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.activeSandboxes = new Map();
    console.log('E2BService initialized with API key present:', !!apiKey);
  }

  async createPreviewSession(files, startCommand = 'npm run dev') {
    console.log('Creating preview session with API key length:', this.apiKey?.length);

    const templates = ['node'];
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

        for (const [filePath, content] of Object.entries(files)) {
          await sandbox.files.write(filePath, content);
        }

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

        // Determine expected port based on startCommand
        let expectedPort = 5173; // default for Vite
        if (startCommand.includes('node')) {
          expectedPort = 3000; // default for Node.js servers
        }
        // You can add more framework detection here

        console.log(`Starting in background: ${startCommand}`);
        await sandbox.commands.run(startCommand, { background: true });

        // Wait up to 30 seconds for the server to start on the expected port
        let ready = false;
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 1000));
          try {
            const test = await fetch(`http://localhost:${expectedPort}`);
            if (test.ok) {
              ready = true;
              break;
            }
          } catch {
            // port not ready yet
          }
        }

        if (!ready) {
          throw new Error(`Server did not start within timeout on port ${expectedPort}.`);
        }

        const previewUrl = `https://${expectedPort}-${sandbox.sandboxId}.e2b.app`;
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
