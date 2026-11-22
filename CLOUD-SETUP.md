# 三坊七巷：Codex Cloud / Colab / Cloud Run

## 三个环境的职责
- Codex Cloud：GitHub 源码、依赖、开发、HTTP 检查和浏览器验收。
- Colab：独立授权的 NVIDIA GPU 渲染，笔记本中显示实际 Git 提交和 GPU，结果下载后校验导入。
- Cloud Run：只读网页与静态资产服务，不承担 Blender GPU，不提供公开文件写入。

## 源码与运行
仓库：https://github.com/GitForChenxin/sanfang-qixiang-stage-v2
本轮独立分支：infra/codex-cloud-run。它是本地 V4 的一次快照，不自动覆盖其他任务之后的爱心树改动。

Codex 创建环境时选择该仓库与分支，环境名建议 sanfang-qixiang。
安装脚本：bash .codex/setup.sh。
启动：PORT=8080 python3 deploy/server.py。
健康检查：GET /healthz；网页：GET /；爱心树独立预览：GET /heart-tree-preview.html。
修改资源后：python3 scripts/build_site.py。
检查：python3 -m unittest discover -s tests -v；node --check renderer.mjs。
若云端选择器不支持分支，请在环境设置会话明确检出 infra/codex-cloud-run，再安装、检查并发布环境。

## 渲染
[在 Colab 打开 GitHub 笔记本](https://colab.research.google.com/github/GitForChenxin/sanfang-qixiang-stage-v2/blob/infra/codex-cloud-run/colab/cloud-workshop.ipynb)
首次运行选择有余额的 GPU。GIT_REF 推荐改成需要渲染的提交 SHA。
结果：sanfang-colab-result.zip，含 sourceCommit、GPU、分辨率、两张院落预览与 Blender 模型。
导入：python3 colab/import_result.py <结果ZIP>；重新构建站点、验收，再提交资产。
Colab 浏览器会话与 Codex 的云端环境相互独立。此项目没有创建 Colab 服务账号、开放未鉴权渲染接口或宣称无需登录的自动调用。

## Google Cloud
项目：project-53603ed3-8236-40ec-90a；区域：asia-east1。
建议服务名：sanfang-qixiang；若已有同名服务，先检查再更新。
部署入口：bash deploy/cloud-run.sh（需要已授权 gcloud）。
部署源为 dist/cloudrun，包含 Dockerfile、server.py、public/；Python 3.12，非 root 用户运行。
参数：1 CPU / 512Mi，按请求计费，min=0，max=1，concurrency=40，timeout=60s，默认 IAM 私有。
不配置自定义域名、GPU、数据库或长期密钥。
Google Cloud 赠送额度、免费用量和实际费用必须在账单页面核实；max=1 不等于硬性费用上限。

## 完成定义
1. 源码已提交到上述分支；仅本地准备不算云端完成。
2. Codex 界面出现已发布且可运行的环境，启动和健康检查成功。
3. Cloud Run 出现 Ready 修订；实际访问验证与权限模式有记录。
4. Colab 如实际执行，须保留日志和产物；否则标明“入口已准备，未运行”。
