# 三坊七巷云端开发约定

## 项目与运行
- Three.js 静态网页；入口 index.html，院落与街区在 renderer.mjs，爱心树在 heart-tree.mjs。
- 安装开发依赖：npm ci --ignore-scripts；python3 -m pip install -r requirements-dev.txt。
- 云端环境初始化：bash .codex/setup.sh。
- 预览：python3 scripts/build_site.py，然后 PORT=8080 python3 deploy/server.py（监听 0.0.0.0）。
- 修改静态资源后重新运行 build_site.py。本机导出接收器 server.py 保留为本地用途。

## 验证与验收
- 执行 python3 -m unittest discover -s tests -v 和修改模块的 node --check。
- 检查浏览器 WebGL、交互视角、街区漫游、材质切换、光影预览及移动端；离线通过不能写成已完成浏览器验收。
- 交付改动清单、验证证据、未解决问题、分支与提交。需求取舍和最终视觉验收由用户决定。

## Colab 与部署
- Colab 负责 GPU 渲染；使用 colab/cloud-workshop.ipynb 从明确 Git ref 获取源代码。
- 运行期间输出保存 Google Drive；用户授权的本地浏览器 Colab 会话与 Codex 云端是不同会话。
- 不能声称已调用 Colab，除非有实际执行日志、GPU 信息和输出文件。
- 渲染结果经 colab/import_result.py 校验后才能更新 assets。先生成独立分支，不覆盖其他工作中的分支。
- Cloud Run 只部署 scripts/build_site.py 生成的 dist/cloudrun，不发布整个源码目录，不提供写入、密钥或渲染接口。
- 项目 project-53603ed3-8236-40ec-90a，默认 asia-east1、min=0、max=1、1CPU/512Mi、按请求计费。
- 不创建服务账号密钥，不把令牌、.env、私有文件提交 Git。使用现有登录或用户批准的短期身份。
- 免费额度不等于硬性费用上限；改变计费、公开访问或新增敏感权限时按用户授权范围处理。
- 保留照片、OSM、Three.js 的署名和许可；这是人工构建示意模型，不声称摄影测量或实景扫描。
