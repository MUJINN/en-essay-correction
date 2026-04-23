# 前端开发文档

## 项目概述

英语作文精批系统的前端部分，采用原生 JavaScript + HTML + CSS 开发。

## 技术栈

- **核心**: 原生 JavaScript (ES6+)
- **UI**: HTML5 + CSS3
- **图标**: Font Awesome 6.5.0
- **API通信**: Fetch API
- **后端**: FastAPI (Python)

## 目录结构

```
├── templates/
│   └── index.html              # 主页面模板
├── static/
│   ├── css/
│   │   └── style.css          # 样式文件
│   └── js/
│       ├── main.js            # 主逻辑文件
│       └── api_client_v2.js   # API客户端（如有）
```

## 快速开始

### 1. 启动后端服务

```bash
# 安装依赖
pip install -r requirements.txt

# 初始化数据库
python init_db.py

# 启动服务
python api_v2.py
# 或
uvicorn api_v2:app_v2 --host 0.0.0.0 --port 8008 --reload
```

### 2. 访问前端

- 本地访问: http://localhost:8008
- 服务器访问: http://10.10.2.40:8008
- API文档: http://localhost:8008/docs

## API接口说明

详见根目录的 [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)

### 核心接口

1. **OCR识别**: `POST /api/v2/ocr`
2. **作文批改**: `POST /api/v2/correct`
3. **历史记录**: `GET /api/v2/history/list`
4. **加载示例**: `GET /api/load-example`

## 前端架构说明

### 页面结构

系统采用单页应用（SPA）架构，通过 Tab 切换展示不同功能：

1. **批改作文** - 主功能页面
2. **历史记录** - 查看批改历史
3. **批量处理** - 批量批改作文
4. **数据分析** - 统计分析（待开发）

### 核心功能模块

#### 1. 输入模式切换
- 文本输入模式
- 图片OCR模式

#### 2. OCR识别
- 文件: `main.js` (行 400-500)
- 功能: 上传图片 → OCR识别 → 显示结果

#### 3. 作文批改
- 文件: `main.js` (行 36-200)
- 功能: 提交表单 → 调用API → 展示结果 → 保存历史

#### 4. 智能标注展示
- 文件: `main.js` (行 600-800)
- 功能: 在图片上绘制标注框（Canvas）

#### 5. 历史记录
- 文件: `main.js` (行 1000-1200)
- 功能: 列表展示 → 详情查看 → 恢复标注

## 开发建议

### 优化方向

1. **框架升级**
   - 考虑迁移到 Vue 3 / React
   - 使用 TypeScript 增强类型安全
   - 引入组件化开发

2. **构建工具**
   - 使用 Vite / Webpack 构建
   - 支持 Hot Module Replacement
   - 代码压缩和优化

3. **代码组织**
   - 拆分 `main.js` 为多个模块
   - 提取公共工具函数
   - 使用状态管理（Pinia / Redux）

4. **UI优化**
   - 引入组件库（Element Plus / Ant Design）
   - 响应式设计优化
   - 移动端适配

5. **开发体验**
   - 添加 ESLint + Prettier
   - 配置环境变量管理
   - 单元测试和E2E测试

### 本地开发调试

#### 方式1: 直接使用后端服务
```bash
python api_v2.py
# 访问 http://localhost:8008
```

#### 方式2: 独立前端开发（需配置）
如需前后端分离开发，需要：
1. 创建独立的前端项目
2. 配置代理解决跨域问题
3. 使用环境变量配置 API 地址

### 代码规范

- 使用 ES6+ 语法
- 函数命名采用驼峰命名法
- 添加必要的注释
- 保持代码格式一致

## 待优化问题

1. **代码耦合**: `main.js` 文件过大（1500+ 行），需拆分
2. **错误处理**: 错误处理不够完善，需增强
3. **加载状态**: 部分异步操作缺少 Loading 提示
4. **用户体验**: 需要添加更多交互反馈
5. **浏览器兼容**: 需要测试多浏览器兼容性

## 常见问题

### Q1: 如何修改API地址？
修改 `main.js` 或 `api_client_v2.js` 中的 API 地址配置。

### Q2: 图片上传失败？
检查文件大小限制和文件格式（支持 PNG/JPG/JPEG）。

### Q3: OCR识别不准确？
OCR服务地址: `http://49.7.214.122:8001/ocr/batch`，如有问题请联系后端。

### Q4: 本地开发时跨域问题？
后端已配置CORS允许所有来源，如仍有问题请检查浏览器安全策略。

## 联系方式

如有问题，请联系后端开发团队。
