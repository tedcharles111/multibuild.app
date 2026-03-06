import { Sandbox } from '@e2b/code-interpreter';

class E2BService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.activeSandboxes = new Map();
    console.log('E2BService initialized with API key present:', !!apiKey);
  }

  async createPreviewSession(files, startCommand = 'npm run dev') {
    console.log('Creating preview session with API key length:', this.apiKey?.length);
    // List of possible templates to try
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
        if (sandbox && sandbox.filesystem) {
          console.log(`✅ Template ${template} succeeded`);
          // Write files
          for (const [filePath, content] of Object.entries(files)) {
            await sandbox.filesystem.write(filePath, content);
          }
          const install = await sandbox.commands.run('npm install');
          if (install.exitCode !== 0) {
            throw new Error(`npm install failed: ${install.stderr}`);
          }
          await sandbox.commands.run(startCommand, { background: true });
          const previewUrl = await sandbox.getHostUrl(5173);
          this.activeSandboxes.set(sandbox.sandboxId, { sandbox, createdAt: new Date(), previewUrl });
          return {
            sessionId: sandbox.sandboxId,
            previewUrl,
            logs: { stdout: install.stdout, stderr: install.stderr }
          };
        } else {
          console.log(`Template ${template} returned sandbox without filesystem`, sandbox);
        }
      } catch (err) {
        console.error(`Template ${template} failed:`, err.message);
        if (err.response) console.error('Response data:', err.response.data);
        lastError = err;
      }
    }
    throw new Error(`All templates failed. Last error: ${lastError?.message}`);
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
