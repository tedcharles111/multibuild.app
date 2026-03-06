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
          if (hasPackageJson) {
            console.log('Running npm install...');
            const install = await sandbox.commands.run('npm install');
            if (install.exitCode !== 0) {
              throw new Error(`npm install failed: ${install.stderr}`);
            }
          } else {
            console.log('No package.json found, skipping npm install');
          }

          // Run the start command and wait for it to be ready
          console.log(`Starting: ${startCommand}`);
          const process = await sandbox.commands.run(startCommand, { background: true });

          // Wait up to 15 seconds for the server to start
          let ready = false;
          for (let i = 0; i < 15; i++) {
            await new Promise(r => setTimeout(r, 1000));
            // Try to detect which port is listening – for simplicity, assume 5173 for Vite, 3000 for Node
            // In a real implementation, you'd parse the logs or check open ports.
            // For now, we'll use a fixed port based on the startCommand
            const port = startCommand.includes('vite') ? 5173 : 3000;
            try {
              const test = await fetch(`http://localhost:${port}`);
              if (test.ok) {
                ready = true;
                break;
              }
            } catch {
              // not ready yet
            }
          }

          if (!ready) {
            // Capture logs to see what happened
            const logs = await sandbox.commands.run('cat /tmp/server.log 2>/dev/null || echo "No logs"');
            throw new Error(`Server did not start within timeout. Logs: ${logs.stdout} ${logs.stderr}`);
          }

          const port = startCommand.includes('vite') ? 5173 : 3000;
          const previewUrl = `https://${port}-${sandbox.sandboxId}.e2b.app`;
          this.activeSandboxes.set(sandbox.sandboxId, { sandbox, createdAt: new Date(), previewUrl });

          return {
            sessionId: sandbox.sandboxId,
            previewUrl,
            message: 'Preview created successfully'
          };
        } else {
          console.log(`Template ${template} returned sandbox without filesystem`, sandbox);
        }
      } catch (err) {
        console.error(`Template ${template} failed:`, err);
        lastError = err;
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
