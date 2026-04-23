# 英语作文精批系统

## 📚 文档导航

- **[API接口文档](./API_DOCUMENTATION.md)** - 完整的API接口说明
- **[前端开发文档](./FRONTEND_README.md)** - 前端开发指南和架构说明
- **[项目交接清单](./HANDOVER.md)** - 给前端同事的完整交接文档
- **[配置示例](./config.example.txt)** - 环境配置模板

## 架构

本系统采用**后端主导架构**，OCR识别和智能标注匹配在后端完成，数据持久化到数据库。

## 核心文件

### 后端服务
- `api_v2.py` - API服务（FastAPI）
- `models.py` - 数据库模型（SQLAlchemy）
- `database.py` - 数据库连接
- `schemas.py` - 请求/响应模型
- `annotation_matcher.py` - 智能标注匹配算法
- `init_db.py` - 数据库初始化脚本

### 前端
- `static/js/main.js` - 前端逻辑
- `static/js/api_client_v2.js` - API客户端

### 模板和静态文件
- `templates/index.html` - 主页模板
- `static/` - CSS、JS、图片等静态资源

### 历史记录
- `history_records/` - JSON格式的历史记录文件

## 快速开始

### 1. 安装依赖

```bash
pip install fastapi uvicorn sqlalchemy pydantic requests
```

### 2. 初始化数据库

```bash
python init_db.py
```

### 3. 启动服务

```bash
python api_v2.py
# 或
nohup ./venv/bin/uvicorn api_v2:app_v2 --host 0.0.0.0 --port 8008 > nohup.out 2>&1 &
```

### 4. 访问

- API文档：http://10.10.2.40:8008/docs

## API端点

### OCR识别
```
POST /api/v2/ocr
参数: multipart/form-data (image)
返回: OCR坐标数据 + 图片ID
```

### 批改API
```
POST /api/v2/correct
参数: {
    ocr_data: {...},      # OCR数据（可选）
    student_answer: "...",
    question_content: "...",
    grade: "...",
    ...
}
返回: 批改结果 + OCR坐标 + 智能标注匹配
```

### 历史记录
```
GET /api/v2/history/list?page=1&size=20  # 列表
GET /api/v2/history/{record_id}           # 详情（包含完整OCR数据）
```

## 功能特点

### 智能标注
- 支持精彩表达、良好表达和待改进表达标注
- 智能匹配OCR坐标和标注文本
- 可视化展示智能标注

### 历史记录
- 自动保存批改结果
- 支持跨设备同步
- 完整的智能标注恢复

## 数据库

### 表结构
- `ocr_data` - OCR识别结果和坐标
- `correction_results` - 批改结果和智能标注
- `history_records` - 历史记录主表

### 初始化
```bash
python init_db.py
```

## 配置

### OCR服务
- 地址：http://49.7.214.122:8001/ocr/batch
- 如需修改，编辑相关API文件

### 工作流API
- 地址：http://dify.iyunxiao.com/v1/workflows/run
- API Key配置在"一些配置和说明.txt"文件中

## 部署

### 开发环境
```bash
uvicorn api_v2:app_v2 --reload --port 8008
```
source /home/wangdi5/en-essay-correction/venv_new/bin/activate && uvicorn api_v2:app_v2 --host 0.0.0.0 --port 8008

### 生产环境
```bash
# 使用Gunicorn
pip install gunicorn
gunicorn api_v2:app_v2 -w 4 -k uvicorn.workers.UvicornWorker --bind 10.10.2.40:8008
```

## 注意事项

1. 首次使用需要运行`python init_db.py`初始化数据库
2. 历史记录文件存储在`history_records/`目录中
3. 静态文件存储在`static/`目录中

## 开发团队

### 后端开发
- 负责人: [填写]

### 前端开发
- 负责人: [填写]

## 许可证

内部使用项目
