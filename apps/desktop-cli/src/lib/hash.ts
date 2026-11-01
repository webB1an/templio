import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

/** 流式计算文件 sha256（大文件不占内存） */
export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
