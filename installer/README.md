# Windows 发布构建
支持 Windows 10/11 x64。安装 Inno Setup 6，将 ISCC.exe 加入 PATH，运行 Build-Installer.ps1。产物在 outputs/releases。
安装包按当前用户安装，无需管理员权限。自动注册 PDF 打开方式和文档图标，安装完成页可跳转系统默认应用设置。Windows 要求用户确认默认应用。
缺少 WebView2 时运行已验证微软签名的 Evergreen 引导安装程序，需要联网。已有运行环境则跳过。
用户数据在 LocalAppData/Paperboat/WebView2，升级和卸载均不删除此目录。保持安装路径和本地服务端口不变。
发布前在独立 Windows 虚拟机验证：无运行环境安装、断网失败提示、中文路径 PDF、默认关联、图标、覆盖升级及卸载保留数据。
当前构建未经代码签名，首次运行可能出现 Windows SmartScreen 提示。商业使用 Inno Setup 请核对其许可要求。

## 自动验证
将 paperboat 目录内容作为 GitHub 仓库根目录上传（包含隐藏的 .github 目录）。Actions 中手动运行 Windows installer verification，或推送 v 开头标签。工作流仅上传测试产物，不自动发布 Release。云端任务尚未执行。
Test-Installer.ps1 只能在干净测试账户/虚拟机执行，会安装并卸载纸舟。检测到已有注册会停止。覆盖测试目前是同版本重装，真实旧版升级仍需单独验收；数据保留使用标记文件检查，不等同于验证 IndexedDB 内容迁移。
执行 New-SandboxTest.ps1 后，双击相邻 releases/Test-Paperboat.wsb。需已启用 Windows Sandbox。测试脚本被复制到沙盒内部运行，结果在 C:/TestRun/test-results；关闭沙盒前复制结果。主机共享目录均只读。
桌面验收仍需检查默认应用系统确认、中文路径 PDF 双击、实际图标、OCR 和书架数据，以及缺少 WebView2/断网安装。GitHub Windows Server 托管机不能替代 Windows 10/11 普通账户验收。
