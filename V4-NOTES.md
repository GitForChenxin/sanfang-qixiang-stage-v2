# 三坊七巷 · Colab 画质增强 V4

基线为 `GitForChenxin/sanfang-qixiang-stage-v2` 本地最新 V3-GIS 工作区，包含此前尚未提交的 1:1 街区与探索模式改动。V4 在独立目录和 `improve/colab-visual-v4` 分支开发。

## 画面改动

- Colab 生成五种可平铺 PBR 材质：旧杉木、灰墙、花岗岩、青灰瓦和青石；每种包含颜色、切线法线与粗糙度，共 15 张 1024px 贴图。
- 替换颜色与旧贴图重复叠乘造成的过暗效果；支持在同一场景切换原版材质作比较。
- 添加柔和环境反射与 AgX 色调映射；近景收紧阴影范围，保持屋檐和木构接触阴影清晰。
- 水池使用小幅扰动的投影反射与视角相关反射强度，降低原高频条纹层的不自然高光。
- 添加两张来自现有院落原模型的 1440×960 Cycles 离线预览；三维漫游与预览分开切换。

## 启动与复现

双击 `Start-Preview.cmd`，打开 http://127.0.0.1:5178/ 。静态部署时根目录设置为本目录，保留相对路径即可。

`colab/sanfang-visual-workshop.ipynb` 是可复现工坊；上传 `colab/sanfang-input.zip` 后，依次运行准备、渲染、下载三格。运行时选择 T4 GPU。新会话需要重新安装临时运行环境。

生成新的输入包：`python colab/build_notebook.py`。

导入下载成果：`python colab/import_result.py <sanfang-colab-v4-result.zip 的路径>`。

离线导出器使用工程原有 JavaScript 几何构建函数和原生 Canvas2D，保留原模型、原 UV、雕花、壁画和叶片遮罩；不以另一份重建几何替代。Blender 坐标转换统一处理 Three.js 的 Y-up。

## 当前边界

离线渲染范围为水榭戏台核心院落、花厅、围墙及近旁植物，网页仍保留全街区 GIS 场景。建筑尺寸和艺术细节仍是原模型的示意表达；本轮没有新增实测、扫描或文保依据。来源与第三方许可继续保留在 `SOURCES.md` 和 `THREE-LICENSE`。

已生成 `sanfang-v4-preview.html` 单文件离线版本，模块、地图、材质和预览均内嵌。浏览器自动控制策略仅允许 HTTP(S)，本次不能自动打开本地 file 页面；本机预览服务也需要在本机启动。桌面、移动端交互与控制台验收因此待完成，语法和生成资产检查不替代该验收。
