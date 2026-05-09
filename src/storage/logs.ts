import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

export class LogStore {
  private dir: string;

  constructor(dataDir: string) {
    this.dir = join(dataDir, "logs");
    mkdirSync(this.dir, { recursive: true });
  }

  write(jobId: string, content: string): void {
    const path = join(this.dir, `${jobId}.log`);
    writeFileSync(path, content, { flag: "a" });
  }

  read(jobId: string): string {
    const path = join(this.dir, `${jobId}.log`);
    if (!existsSync(path)) return "";
    return readFileSync(path, "utf-8");
  }

  getPath(jobId: string): string {
    return join(this.dir, `${jobId}.log`);
  }

  delete(jobId: string): void {
    const path = join(this.dir, `${jobId}.log`);
    if (existsSync(path)) unlinkSync(path);
  }
}
