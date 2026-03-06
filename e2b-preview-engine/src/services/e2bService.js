import { Sandbox } from '@e2b/code-interpreter';

class E2BService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.activeSandboxes = new Map();
    console.log('E2BService initialized with API key present:', !!apiKey);
  }

  async createPreviewSession(files, startCommand = 'npm run dev') {
    console.log('Creating preview session with API key length:', this.apiKey?.length);

    // Use only the 'node' template (known to work well)
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

        // Run the start command and monitor its output
        console.log(`Starting: ${startCommand}`);
        // Start process in background
        const proc = await sandbox.commands.run(startCommand, { background: true });

        // Capture stderr/stdout (we'll log them for debugging)
        let stdout = '', stderr = '';
        proc.stdout?.on('data', (data) => {
          const chunk = data.toString();
          stdout += chunk;
          console.log(`[sandbox] stdout: ${chunk}`);
        });
        proc.stderr?.on('data', (data) => {
          const chunk = data.toString();
          stderr += chunk;
          console.error(`[sandbox] stderr: ${chunk}`);
        });

        // Wait up to 30 seconds for the server to start
        const port = 5173; // we assume this port
        let ready = false;
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 1000));
          // Check if process exited prematurely
          if (proc.exitCode !== null) {
            throw new Error(`Start command exited early with code ${proc.exitCode}. stderr: ${stderr}`);
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
          throw new Error(`Server did not start within timeout. Last logs: stdout: ${stdout}, stderr: ${stderr}`);
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
        // Attempt to clean up sandbox if it was created
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
