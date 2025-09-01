// synologyService.js

class SynologyService {
  constructor({ url, username, password, timeout = 120000, retries = 3 }) {
    this.url = url;
    this.username = username;
    this.password = password;
    this.timeout = timeout; // milliseconds
    this.retries = retries; // number of retry attempts
    this.client = null;
  }

  // Initialize WebDAV client
  async init() {
    if (!this.client) {
      const { createClient } = await import("webdav"); // dynamic import
      this.client = createClient(this.url, {
        username: this.username,
        password: this.password,
        timeout: this.timeout
      });
    }
    return this.client;
  }

  // Upload file with retry mechanism
  async uploadFile(remotePath, content) {
    await this.init();

    let attempt = 0;
    while (attempt < this.retries) {
      try {
        await this.client.putFileContents(remotePath, content, { overwrite: true });
        return { success: true, path: remotePath };
      } catch (err) {
        attempt++;
        console.warn(`Upload attempt ${attempt} failed: ${err.message}`);
        if (attempt >= this.retries) throw err;
        await new Promise(res => setTimeout(res, 2000)); // wait 2 seconds before retry
      }
    }
  }

  async downloadFile(remotePath, format = "binary") {
    await this.init();
    return await this.client.getFileContents(remotePath, { format });
  }

  async listFolder(remotePath) {
    await this.init();
    return await this.client.getDirectoryContents(remotePath);
  }

  async deleteFile(remotePath) {
    await this.init();
    await this.client.deleteFile(remotePath);
    return { success: true };
  }
}

module.exports = SynologyService;
