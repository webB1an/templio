# 模板宝桌面工作台

本地生成 PPT / Word 模板的封面、缩略图与页面预览，不需要敲命令。

## 直接使用

优先双击打包好的程序：

```text
release\模板宝工作台-win32-x64\模板宝工作台.exe
```

如果还没有打包，双击仓库根目录的：

```text
启动模板宝工作台.bat
```

第一次启动会自动安装依赖并构建渲染引擎。

## 使用流程

1. 选择包含 `.pptx` / `.docx` 的源文件夹
2. 选择输出文件夹（默认 `dist-packages`）
3. 设置预览页数
4. 点击「开始生成」
5. 在右侧查看封面结果，点「打开文件夹」或「查看封面」
6. 点右上角「上传到服务器」，填写管理员密码后上传

上传说明：

- 默认上传**输出文件夹里的全部物料包**，已存在的会跳过
- 勾选「同时上传源文件」后，才能继续做网盘自动同步；同步成功后服务器自动删除源文件
- 管理员密码只用于本次上传，不会保存
- 上传成功后到管理端复核、上架

输出结构：

```text
输出目录\<hash8>-<文件名>\
  images\cover.webp
  images\thumb.webp
  images\preview-01.webp
  source\原文件.pptx
  manifest.json
  text.json
```

## 开发

```powershell
npm run studio
```

## 重新打包

```powershell
npm run build:desktop
```

> 当前 exe 会从自身位置向上寻找仓库里的 `apps/desktop-cli/dist/index.js`，
> 因此请把 `release\模板宝工作台-win32-x64` 保留在仓库目录内使用。
> 如果要发给没有仓库环境的同事，需要下一版把 CLI 与运行时一起打进安装包。
