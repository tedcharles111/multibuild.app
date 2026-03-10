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

        // Run the start command and capture output
        console.log(`Starting: ${startCommand}`);
        // We run synchronously to get the output (but it will block if the server runs forever)
        // Instead, we run in background and then poll, but we need the error if it fails early.
        // Let's run in background and also capture stderr via a separate mechanism.
        const proc = await sandbox.commands.run(startCommand, { background: true });

        // Wait up to 60 seconds for the server to start on the expected port
        const port = startCommand.includes('vite') ? 5173 : 3000;
        let ready = false;
        let stderr = '';
        proc.stderr?.on('data', (data) => { stderr += data.toString(); });

        for (let i = 0; i < 60; i++) {
          await new Promise(r => setTimeout(r, 1000));
          // Check if process exited
          if (proc.exitCode !== null) {
            throw new Error(`Start command exited with code ${proc.exitCode}. Stderr: ${stderr}`);
          }
          // Try to connect to the port
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
          throw new Error(`Server did not start within timeout on port ${port}. Stderr: ${stderr}`);
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
