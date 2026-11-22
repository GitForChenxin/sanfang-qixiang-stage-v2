# 三坊七巷 · 水榭戏台 · Colab 画质增强 V4

本轮以现有 V3-GIS 街区与院落模型为基线，接入 Colab 生成的 15 张 PBR 材质贴图及两张 1440×960 Cycles 预览。支持材质对比、三维漫游与光影预览切换；细节见 [V4-NOTES.md](./V4-NOTES.md)。

- 免服务查看：双击 `sanfang-v4-preview.html`，全部模块、地图与图像均已内嵌。
- 开发预览：双击 `Start-Preview.cmd`，打开 http://127.0.0.1:5178/ 。
- 云端复现：[三坊七巷 Colab 画质工坊](https://colab.research.google.com/drive/1XNmy-72GhPB4vmSQ6zzFArxWrU_IKfBx)，上传 `colab/sanfang-input.zip`。
- 可编辑模型：`colab/output/sanfang-courtyard-v4.blend`，原贴图已打包在模型中。

已验证 GPU 渲染、图像尺寸及内容、15 张贴图的完整性与法线数据，以及 JavaScript / Python 语法。网页桌面、移动端交互与控制台尚待实机验收，不能用这些离线检查替代。

水榭戏台近景原型；根据福州官源和实景照片人工建模，不是实景扫描，也不代表测绘尺寸。

## 打开
- 静态站点的根目录设置为本目录，入口是 index.html；项目型 GitHub Pages 子路径也可用。需通过 HTTP(S) 打开，不直接使用 file: URL。
- 要在本机开发：进入此目录，运行 python -m http.server 5177 --bind 127.0.0.1，在支持 WebGL 2 的 Chrome 或 Edge 打开 http://127.0.0.1:5177/。Ctrl+C 停止。
- 不需要 npm 安装、构建、后端、账户、API 密钥或 CDN；页面、模块、照片均相对加载。将 .mjs 和 .js 作为 JavaScript MIME 提供。不要将绝对路径或个人电脑接入公网。

## 给下一位维护者
- index.html：标题、响应式界面、控制按钮、实景照片弹窗与署名。
- model.mjs：场地尺度、舞台轴线和相机预设。
- renderer.mjs：Three.js 模型、材质、灯光、水面、视角交互和当前画面导出。
- reference.jpg：Siyuwj 的 2019 年实景参考照片的缩小副本，不是模型贴图。
- three.module.min.js、three.core.min.js、Reflector.js：Three.js 库和反射组件，MIT，见 THREE-LICENSE。
- SOURCES.md：官源及原图文件页、授权和模型边界；.nojekyll 用于原样静态部署。

验收：首次进入显示「三维场景已就绪」，切换四个视角并可恢复隔池视角，拖动/缩放，打开实景照片检查信用与 CC BY-SA 4.0，分别检查首页和所有模块/照片在项目子路径下匿名可读。涉及建筑精度时保留「人工还原，非扫描」说明；不要从模型反推实际尺寸。

项目原创内容没有追加开源授权。第三方资产按各自许可使用，见 SOURCES.md。
