import JSZip from "jszip";

/**
 * 上传源文件前清理 Office 文档属性：
 * - 原作者 / 最后修改者
 * - 公司 / 部门 / 模板来源
 * - 标题 / 主题 / 关键词 / 备注里可能带有的店铺名、网址
 *
 * 只改 docProps 元数据，不动幻灯片正文。清理失败时返回原文件。
 */
export async function stripOoxmlAuthorMetadata(buffer: Buffer): Promise<Buffer> {
  try {
    const zip = await JSZip.loadAsync(buffer);

    const core = zip.file("docProps/core.xml");
    if (core) {
      const xml = await core.async("string");
      zip.file("docProps/core.xml", scrubCore(xml));
    }

    const app = zip.file("docProps/app.xml");
    if (app) {
      const xml = await app.async("string");
      zip.file("docProps/app.xml", scrubApp(xml));
    }

    if (zip.file("docProps/custom.xml")) {
      zip.file(
        "docProps/custom.xml",
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties"></Properties>',
      );
    }

    return await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
  } catch {
    return buffer;
  }
}

function scrubCore(xml: string): string {
  const clearTags = [
    "dc:creator",
    "cp:lastModifiedBy",
    "dc:title",
    "dc:subject",
    "dc:description",
    "cp:keywords",
    "cp:category",
  ];
  let result = xml;
  for (const tag of clearTags) {
    result = result
      .replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), `<${tag}></${tag}>`)
      .replace(new RegExp(`<${tag}\\b[^>]*\\/>`, "gi"), `<${tag}></${tag}>`);
  }
  return result;
}

function scrubApp(xml: string): string {
  let result = xml;
  for (const tag of ["Company", "Manager", "Template"]) {
    result = result
      .replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), `<${tag}></${tag}>`)
      .replace(new RegExp(`<${tag}\\b[^>]*\\/>`, "gi"), `<${tag}></${tag}>`);
  }
  return result;
}
